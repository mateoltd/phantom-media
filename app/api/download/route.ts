import { NextRequest } from "next/server";
import {
  CLIENT_FALLBACK_ORDER,
  NO_CIPHER_CLIENTS,
  withSessionRetry,
} from "@/lib/youtube/client";
import type { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for long videos

// Parallel download settings - YouTube throttles single connections
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const PARALLEL_CONNECTIONS = 6; // Concurrent chunk downloads

const CDN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://www.youtube.com",
  Referer: "https://www.youtube.com/",
};

/**
 * Server-side download endpoint with parallel chunked fetching.
 * YouTube throttles single connections; parallel range requests bypass this.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get("videoId");
  const formatSpec = searchParams.get("formatSpec");

  if (!videoId) {
    return new Response("Missing videoId parameter", { status: 400 });
  }

  if (!formatSpec) {
    return new Response("Missing formatSpec parameter", { status: 400 });
  }

  const itag = parseInt(formatSpec.split("+")[0], 10);
  if (isNaN(itag)) {
    return new Response("Invalid formatSpec", { status: 400 });
  }

  try {
    const { url, contentLength } = await withSessionRetry((yt) =>
      getStreamUrl(yt, videoId, itag)
    );

    // If we don't know the size, fall back to simple streaming
    if (!contentLength) {
      return streamSimple(url);
    }

    // Stream chunks in parallel and pipe to response
    const stream = createParallelDownloadStream(url, contentLength);

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(contentLength));
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(stream, { headers });
  } catch (error) {
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return new Response(message, { status: 500 });
  }
}

/**
 * Simple single-connection stream (fallback when size unknown)
 */
async function streamSimple(url: string): Promise<Response> {
  const upstream = await fetch(url, { headers: CDN_HEADERS });
  if (!upstream.ok) {
    throw new Error(`YouTube CDN returned ${upstream.status}`);
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
  headers.set("Access-Control-Allow-Origin", "*");
  const cl = upstream.headers.get("Content-Length");
  if (cl) headers.set("Content-Length", cl);

  return new Response(upstream.body, { headers });
}

/**
 * Creates a ReadableStream that downloads chunks in parallel and emits them in order.
 */
function createParallelDownloadStream(
  url: string,
  totalSize: number
): ReadableStream<Uint8Array> {
  const chunks: { start: number; end: number }[] = [];
  for (let start = 0; start < totalSize; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
    chunks.push({ start, end });
  }

  let chunkIndex = 0;
  const chunkData = new Map<number, Uint8Array>();
  let nextChunkToEmit = 0;
  let activeDownloads = 0;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let downloadError: Error | null = null;

  const startNextDownload = async () => {
    if (downloadError || chunkIndex >= chunks.length) return;

    const myIndex = chunkIndex++;
    const { start, end } = chunks[myIndex];
    activeDownloads++;

    try {
      const response = await fetch(url, {
        headers: {
          ...CDN_HEADERS,
          Range: `bytes=${start}-${end}`,
        },
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`Chunk fetch failed: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      chunkData.set(myIndex, new Uint8Array(buffer));

      // Emit chunks in order
      while (chunkData.has(nextChunkToEmit)) {
        const data = chunkData.get(nextChunkToEmit)!;
        chunkData.delete(nextChunkToEmit);
        controller.enqueue(data);
        nextChunkToEmit++;
      }

      activeDownloads--;

      // Start next download or close if done
      if (chunkIndex < chunks.length) {
        startNextDownload();
      } else if (activeDownloads === 0 && nextChunkToEmit >= chunks.length) {
        controller.close();
      }
    } catch (err) {
      downloadError = err instanceof Error ? err : new Error(String(err));
      controller.error(downloadError);
    }
  };

  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      // Start initial parallel downloads
      const initialBatch = Math.min(PARALLEL_CONNECTIONS, chunks.length);
      for (let i = 0; i < initialBatch; i++) {
        startNextDownload();
      }
    },
    cancel() {
      downloadError = new Error("Download cancelled");
    },
  });
}

interface StreamResult {
  url: string;
  contentLength?: number;
}

async function getStreamUrl(
  yt: Innertube,
  videoId: string,
  itag: number
): Promise<StreamResult> {
  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const streaming = info.streaming_data;
      if (!streaming) continue;

      const allFormats = [
        ...(streaming.formats ?? []),
        ...(streaming.adaptive_formats ?? []),
      ];

      const format = allFormats.find((f) => f.itag === itag);
      if (!format) continue;

      // IOS/ANDROID have pre-signed URLs ready to use
      if (NO_CIPHER_CLIENTS.has(client) && format.url) {
        return {
          url: format.url,
          contentLength: format.content_length,
        };
      }

      // For other clients, try decipher if player is available
      if (yt.session.player) {
        const url = await format.decipher(yt.session.player);
        if (url) {
          return {
            url,
            contentLength: format.content_length,
          };
        }
      }
    } catch {
      // Try next client
    }
  }

  throw new Error("Could not get stream URL for this format");
}
