import { muxStreams } from "@/lib/ffmpeg/muxer";
import type { DownloadOption } from "@/lib/types";

export interface DownloadWorkerCallbacks {
  onProgress: (progress: number) => void;
  onStatusChange: (status: "started" | "completed" | "failed") => void;
  onError: (message: string) => void;
  signal: AbortSignal;
}

/**
 * Orchestrates a single download.
 * Flow: 1) Get CDN URL from server, 2) Download via client-side proxy
 * This avoids YouTube's server-IP blocking by having the client fetch.
 */
export async function executeDownload(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  callbacks: DownloadWorkerCallbacks
): Promise<void> {
  const { onProgress, onStatusChange, onError, signal } = callbacks;

  try {
    onStatusChange("started");

    if (option.needsMuxing && !option.isAudioOnly && option.streams.length >= 2) {
      await downloadAndMux(option, videoId, fileName, onProgress, signal);
    } else if (option.needsMuxing && option.isAudioOnly) {
      await downloadAndConvertAudio(option, videoId, fileName, onProgress, signal);
    } else {
      await downloadDirect(option, videoId, fileName, onProgress, signal);
    }

    onStatusChange("completed");
  } catch (error) {
    if (signal.aborted) return;
    const message =
      error instanceof Error ? error.message : "Download failed";
    onError(message);
    onStatusChange("failed");
  }
}

/**
 * Get the YouTube CDN URL from our server, then fetch via client-side proxy.
 * Server resolves URL (IOS client), client downloads (avoids IP blocking).
 */
async function fetchStream(
  videoId: string,
  formatSpec: string,
  expectedSize: number,
  onProgress: (downloaded: number, total: number) => void,
  signal: AbortSignal
): Promise<Blob> {
  // Step 1: Get CDN URL from server
  const urlResponse = await fetch("/api/stream-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, formatSpec }),
    signal,
  });

  if (!urlResponse.ok) {
    const data = await urlResponse.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to get stream URL: ${urlResponse.status}`);
  }

  const { urls } = await urlResponse.json();
  if (!urls || urls.length === 0) {
    throw new Error("No stream URL returned");
  }

  const cdnUrl = urls[0];

  // Step 2: Download via client-side proxy (avoids server IP blocking)
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(cdnUrl)}`;
  const response = await fetch(proxyUrl, { signal });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = parseInt(
    response.headers.get("content-length") ?? "0",
    10
  );
  const total = contentLength || expectedSize;
  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";

  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, blob.size);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.byteLength;
    onProgress(downloaded, total);
  }

  return new Blob(chunks as BlobPart[], { type: contentType });
}

async function downloadDirect(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<void> {
  const stream = option.streams[0];
  const formatSpec = option.formatSpec ?? stream?.formatSpec;

  if (!formatSpec) {
    throw new Error("Missing format selector");
  }

  const blob = await fetchStream(
    videoId,
    formatSpec,
    option.totalSize,
    (downloaded, total) => {
      onProgress(total > 0 ? downloaded / total : 0);
    },
    signal
  );

  triggerDownload(blob, fileName);
  onProgress(1);
}

async function downloadAndMux(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<void> {
  const videoStream = option.streams.find((s) => !s.isAudioOnly);
  const audioStream = option.streams.find((s) => s.isAudioOnly);

  if (!videoStream || !audioStream) {
    throw new Error("Missing video or audio stream for muxing");
  }

  const videoFormatSpec = videoStream.formatSpec;
  const audioFormatSpec = audioStream.formatSpec;

  if (!videoFormatSpec || !audioFormatSpec) {
    throw new Error("Missing video or audio format selector for muxing");
  }

  const videoSize = videoStream.contentLength || 0;
  const audioSize = audioStream.contentLength || 0;
  const totalSize = videoSize + audioSize;
  let videoDownloaded = 0;
  let audioDownloaded = 0;

  const reportProgress = () => {
    if (totalSize > 0) {
      onProgress(((videoDownloaded + audioDownloaded) / totalSize) * 0.6);
    }
  };

  // Download video + audio in parallel (progress: 0-60%)
  const [videoBlob, audioBlob] = await Promise.all([
    fetchStream(
      videoId,
      videoFormatSpec,
      videoSize,
      (downloaded, total) => {
        videoDownloaded = downloaded;
        if (totalSize === 0 && total > 0) {
          onProgress((downloaded / total) * 0.3);
        } else {
          reportProgress();
        }
      },
      signal
    ),
    fetchStream(
      videoId,
      audioFormatSpec,
      audioSize,
      (downloaded, total) => {
        audioDownloaded = downloaded;
        if (totalSize === 0 && total > 0) {
          onProgress(0.3 + (downloaded / total) * 0.3);
        } else {
          reportProgress();
        }
      },
      signal
    ),
  ]);

  // Mux with ffmpeg.wasm (progress: 60-100%)
  onProgress(0.6);
  const outputBlob = await muxStreams(
    videoBlob,
    audioBlob,
    option.container,
    (muxProgress) => onProgress(0.6 + muxProgress * 0.4)
  );

  triggerDownload(outputBlob, fileName);
  onProgress(1);
}

async function downloadAndConvertAudio(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<void> {
  const formatSpec = option.formatSpec ?? option.streams[0]?.formatSpec;

  if (!formatSpec) {
    throw new Error("Missing audio format selector");
  }

  const blob = await fetchStream(
    videoId,
    formatSpec,
    option.totalSize,
    (downloaded, total) => {
      onProgress(total > 0 ? (downloaded / total) * 0.6 : 0);
    },
    signal
  );

  // Convert with ffmpeg.wasm
  onProgress(0.6);
  const outputBlob = await muxStreams(
    blob,
    null,
    option.container,
    (convertProgress) => onProgress(0.6 + convertProgress * 0.4)
  );

  triggerDownload(outputBlob, fileName);
  onProgress(1);
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
