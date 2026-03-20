import { muxStreams } from "@/lib/ffmpeg/muxer";
import type { DownloadOption, DownloadStatus } from "@/lib/types";
import { BridgeDownload, triggerDownload as triggerBridgeDownload } from "@/lib/ws-bridge/bridge-download";
import { WS_BRIDGE_ENABLED } from "@/lib/constants";

export interface DownloadWorkerCallbacks {
  onProgress: (progress: number) => void;
  onStatusChange: (status: DownloadStatus) => void;
  onError: (message: string) => void;
  signal: AbortSignal;
}

/**
 * Orchestrates a single download using yt-dlp's built-in download + pipe.
 * yt-dlp handles YouTube's throttling internally (range requests, retries),
 * which is dramatically faster than fetching raw CDN URLs.
 *
 * If useBridge is true, uses the WebSocket bridge for downloads (bypasses
 * server IP blocking by having the browser fetch directly from YouTube).
 */
export async function executeDownload(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  callbacks: DownloadWorkerCallbacks,
  useBridge: boolean = false
): Promise<void> {
  const { onProgress, onStatusChange, onError, signal } = callbacks;

  // Use WebSocket bridge if enabled and requested
  if (useBridge && WS_BRIDGE_ENABLED) {
    await executeDownloadViaBridge(option, videoId, fileName, callbacks);
    return;
  }

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
 * Execute download via WebSocket bridge.
 * Browser fetches from YouTube CDN and streams to server for muxing.
 */
async function executeDownloadViaBridge(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  callbacks: DownloadWorkerCallbacks
): Promise<void> {
  const { onProgress, onStatusChange, onError, signal } = callbacks;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const bridge = new BridgeDownload({
      onStatusChange: (status) => {
        onStatusChange(status);
        if (status === "completed" || status === "failed") {
          finish();
        }
      },
      onProgress,
      onError: (message) => {
        onError(message);
        // Ensure we resolve even if status change doesn't fire
        setTimeout(finish, 100);
      },
      onComplete: (blob, outputFileName) => {
        triggerBridgeDownload(blob, outputFileName || fileName);
      },
    });

    // Handle abort
    signal.addEventListener("abort", () => {
      bridge.abort();
      finish();
    });

    // Start the download with error handling
    bridge.start(videoId, option.id, fileName).catch((err) => {
      onError(err instanceof Error ? err.message : "Bridge failed to start");
      onStatusChange("failed");
      finish();
    });
  });
}

/**
 * Fetch a stream from the yt-dlp download endpoint with progress tracking.
 * yt-dlp pipes the download directly to stdout, handling throttle avoidance.
 */
async function fetchStream(
  videoId: string,
  params: Record<string, string>,
  expectedSize: number,
  onProgress: (downloaded: number, total: number) => void,
  signal: AbortSignal
): Promise<Blob> {
  const url = new URL("/api/download", window.location.origin);
  url.searchParams.set("videoId", videoId);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Download failed: ${text || response.statusText}`);
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

  const params: Record<string, string> = {
    formatSpec,
  };

  const blob = await fetchStream(
    videoId,
    params,
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

  // Download video + audio in parallel via yt-dlp pipe (progress: 0-60%)
  const [videoBlob, audioBlob] = await Promise.all([
    fetchStream(
      videoId,
      {
        formatSpec: videoFormatSpec,
      },
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
      {
        formatSpec: audioFormatSpec,
      },
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
    {
      formatSpec,
    },
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
