/**
 * Download orchestrator for WebSocket bridge.
 *
 * Coordinates:
 * - Resolving YouTube CDN URLs
 * - Issuing signed FETCH commands
 * - Managing video + audio streams
 * - Triggering muxing when complete
 */

import type { WebSocket } from "ws";
import {
  encodeFetchCommand,
  encodeMuxProgress,
  encodeOutputChunk,
  encodeOutputDone,
  encodeError,
  ERR_INVALID_VIDEO,
  ERR_FETCH_FAILED,
  ERR_MUX_FAILED,
  type FetchData,
  type FetchDone,
  type FetchError,
  type ResumeRequest,
} from "../protocol";
import { signFetchCommand, completeFetch, type BridgeSession } from "./session";
import {
  createTempDir,
  getTempPaths,
  writeChunk,
  getFileSize,
  computeFileHash,
  cleanupTempDir,
  getResumeCheckpoint,
  createTempReadStream,
} from "./temp-storage";
import { muxWithFFmpeg } from "@/lib/ffmpeg/server-muxer";
import { resolveDownloadOptions } from "@/lib/youtube/streams";
import { WS_CHUNK_SIZE } from "@/lib/constants";
import { generateId } from "@/lib/utils";

interface DownloadState {
  downloadId: string;
  videoId: string;
  optionId: string;
  videoUrl: string;
  audioUrl: string | null;
  videoSize: number;
  audioSize: number;
  videoFetchId: number | null;
  audioFetchId: number | null;
  videoComplete: boolean;
  audioComplete: boolean;
  fileName: string;
}

// Track active downloads by session
const downloadStates = new Map<string, DownloadState>();

/**
 * Start a new download
 */
export async function startDownload(
  ws: WebSocket,
  session: BridgeSession,
  videoId: string,
  optionId: string
): Promise<void> {
  try {
    // Resolve download options
    const options = await resolveDownloadOptions(videoId);
    const option = options.find((o) => o.id === optionId);

    if (!option) {
      ws.send(
        encodeError({
          code: ERR_INVALID_VIDEO,
          message: `Download option not found: ${optionId}`,
        })
      );
      return;
    }

    // Get stream URLs from yt-dlp (we need actual CDN URLs)
    // For now, we construct placeholder URLs - in production, resolve via yt-dlp
    const videoStream = option.streams.find((s) => !s.isAudioOnly);
    const audioStream = option.streams.find((s) => s.isAudioOnly);

    if (!videoStream && !option.isAudioOnly) {
      ws.send(
        encodeError({
          code: ERR_INVALID_VIDEO,
          message: "No video stream found",
        })
      );
      return;
    }

    // Create download state
    const downloadId = generateId();
    const state: DownloadState = {
      downloadId,
      videoId,
      optionId,
      videoUrl: "", // Will be set when we get actual URLs
      audioUrl: null,
      videoSize: videoStream?.contentLength ?? 0,
      audioSize: audioStream?.contentLength ?? 0,
      videoFetchId: null,
      audioFetchId: null,
      videoComplete: option.isAudioOnly,
      audioComplete: !audioStream,
      fileName: `${videoId}.${option.container}`,
    };

    downloadStates.set(session.id, state);
    session.downloadId = downloadId;

    // Create temp directory
    await createTempDir(downloadId);

    // Resolve actual CDN URLs via the download endpoint
    // This calls yt-dlp internally to get signed URLs
    const cdnUrls = await resolveCdnUrls(videoId, option.formatSpec ?? "");

    if (!cdnUrls.videoUrl && !option.isAudioOnly) {
      ws.send(
        encodeError({
          code: ERR_INVALID_VIDEO,
          message: "Failed to resolve video CDN URL",
        })
      );
      return;
    }

    state.videoUrl = cdnUrls.videoUrl ?? "";
    state.audioUrl = cdnUrls.audioUrl ?? null;

    // Issue fetch commands
    if (state.videoUrl && !option.isAudioOnly) {
      issueFetchCommand(ws, session, state, true, 0);
    }

    if (state.audioUrl) {
      issueFetchCommand(ws, session, state, false, 0);
    }
  } catch (error) {
    ws.send(
      encodeError({
        code: ERR_INVALID_VIDEO,
        message: error instanceof Error ? error.message : "Failed to start download",
      })
    );
  }
}

/**
 * Resolve CDN URLs for a video directly using YouTube client
 */
async function resolveCdnUrls(
  videoId: string,
  formatSpec: string
): Promise<{ videoUrl: string | null; audioUrl: string | null }> {
  const {
    CLIENT_FALLBACK_ORDER,
    NO_CIPHER_CLIENTS,
    withSessionRetry,
  } = await import("@/lib/youtube/client");

  const itags = formatSpec.split("+").map((s) => parseInt(s.trim(), 10));
  const videoItag = itags[0];
  const audioItag = itags.length > 1 ? itags[1] : null;

  return withSessionRetry(async (yt) => {
    for (const client of CLIENT_FALLBACK_ORDER) {
      try {
        const info = await yt.getBasicInfo(videoId, { client });
        const streaming = info.streaming_data;

        if (!streaming) continue;

        const allFormats = [
          ...(streaming.formats ?? []),
          ...(streaming.adaptive_formats ?? []),
        ];

        let videoUrl: string | null = null;
        let audioUrl: string | null = null;

        // Resolve video URL
        const videoFormat = allFormats.find((f) => f.itag === videoItag);
        if (videoFormat) {
          if (NO_CIPHER_CLIENTS.has(client)) {
            videoUrl = videoFormat.url ?? null;
          } else if (yt.session.player) {
            videoUrl = (await videoFormat.decipher(yt.session.player)) ?? null;
          }
        }

        // Resolve audio URL
        if (audioItag) {
          const audioFormat = allFormats.find((f) => f.itag === audioItag);
          if (audioFormat) {
            if (NO_CIPHER_CLIENTS.has(client)) {
              audioUrl = audioFormat.url ?? null;
            } else if (yt.session.player) {
              audioUrl = (await audioFormat.decipher(yt.session.player)) ?? null;
            }
          }
        }

        if (videoUrl) {
          return { videoUrl, audioUrl };
        }
      } catch {
        // Try next client
      }
    }

    return { videoUrl: null, audioUrl: null };
  });
}

/**
 * Issue a signed fetch command
 */
function issueFetchCommand(
  ws: WebSocket,
  session: BridgeSession,
  state: DownloadState,
  isVideo: boolean,
  rangeStart: number
): void {
  const url = isVideo ? state.videoUrl : state.audioUrl;
  if (!url) return;

  const size = isVideo ? state.videoSize : state.audioSize;
  const rangeEnd = size > 0 ? size - 1 : 0;

  const cmd = signFetchCommand(session, url, rangeStart, rangeEnd, isVideo);

  if (isVideo) {
    state.videoFetchId = cmd.fetchId;
  } else {
    state.audioFetchId = cmd.fetchId;
  }

  ws.send(
    encodeFetchCommand({
      fetchId: cmd.fetchId,
      timestamp: cmd.timestamp,
      nonce: cmd.nonce,
      signature: cmd.signature,
      url,
      rangeStart,
      rangeEnd,
    })
  );
}

/**
 * Handle incoming fetch data
 */
export async function handleFetchData(
  ws: WebSocket,
  session: BridgeSession,
  data: FetchData
): Promise<void> {
  const state = downloadStates.get(session.id);
  if (!state) return;

  const paths = getTempPaths(state.downloadId);
  const isVideo = data.fetchId === state.videoFetchId;
  const filePath = isVideo ? paths.video : paths.audio;

  // Write chunk to temp file
  await writeChunk(filePath, data.data, data.offset);
}

/**
 * Handle fetch completion
 */
export async function handleFetchDone(
  ws: WebSocket,
  session: BridgeSession,
  done: FetchDone
): Promise<void> {
  const state = downloadStates.get(session.id);
  if (!state) return;

  const isVideo = done.fetchId === state.videoFetchId;
  const paths = getTempPaths(state.downloadId);
  const filePath = isVideo ? paths.video : paths.audio;

  // Verify checksum
  const actualHash = await computeFileHash(filePath);
  if (!actualHash.equals(Buffer.from(done.checksum))) {
    ws.send(
      encodeError({
        code: ERR_FETCH_FAILED,
        message: "Checksum mismatch",
      })
    );
    return;
  }

  // Mark as complete
  if (isVideo) {
    state.videoComplete = true;
    completeFetch(session.id, done.fetchId);
  } else {
    state.audioComplete = true;
    completeFetch(session.id, done.fetchId);
  }

  // Check if both streams are complete
  if (state.videoComplete && state.audioComplete) {
    await startMuxing(ws, session, state);
  }
}

/**
 * Handle fetch error
 */
export async function handleFetchError(
  ws: WebSocket,
  session: BridgeSession,
  error: FetchError
): Promise<void> {
  const state = downloadStates.get(session.id);
  if (!state) return;

  ws.send(
    encodeError({
      code: ERR_FETCH_FAILED,
      message: `Fetch failed: ${error.message}`,
    })
  );

  // Clean up
  await cleanupTempDir(state.downloadId);
  downloadStates.delete(session.id);
}

/**
 * Handle resume request
 */
export async function handleResume(
  ws: WebSocket,
  session: BridgeSession,
  req: ResumeRequest
): Promise<void> {
  // Get checkpoint
  const checkpoint = await getResumeCheckpoint(req.downloadId);
  if (!checkpoint) {
    ws.send(
      encodeError({
        code: ERR_INVALID_VIDEO,
        message: "No checkpoint found for resume",
      })
    );
    return;
  }

  // TODO: Restore download state and issue resume fetch commands
  // This requires persisting download state across sessions
}

/**
 * Start muxing video and audio
 */
async function startMuxing(
  ws: WebSocket,
  session: BridgeSession,
  state: DownloadState
): Promise<void> {
  const paths = getTempPaths(state.downloadId);

  try {
    // Mux with FFmpeg
    await muxWithFFmpeg(
      paths.video,
      state.audioUrl ? paths.audio : null,
      paths.output,
      (progress) => {
        ws.send(encodeMuxProgress(progress));
      }
    );

    // Stream output to client
    await streamOutputToClient(ws, paths.output, state.fileName);

    // Cleanup
    await cleanupTempDir(state.downloadId);
    downloadStates.delete(session.id);
  } catch (error) {
    ws.send(
      encodeError({
        code: ERR_MUX_FAILED,
        message: error instanceof Error ? error.message : "Muxing failed",
      })
    );

    await cleanupTempDir(state.downloadId);
    downloadStates.delete(session.id);
  }
}

/**
 * Stream muxed output to client
 */
async function streamOutputToClient(
  ws: WebSocket,
  outputPath: string,
  fileName: string
): Promise<void> {
  const totalSize = await getFileSize(outputPath);
  const hash = await computeFileHash(outputPath);

  // Stream in chunks
  const stream = createTempReadStream(outputPath);
  let offset = 0;

  for await (const chunk of stream) {
    const data = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
    ws.send(
      encodeOutputChunk({
        offset,
        data: new Uint8Array(data),
      })
    );
    offset += data.length;
  }

  // Send completion
  ws.send(
    encodeOutputDone({
      checksum: new Uint8Array(hash),
      totalSize,
      fileName,
    })
  );
}
