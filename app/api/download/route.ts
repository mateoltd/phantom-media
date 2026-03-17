import { NextRequest } from "next/server";
import {
  CLIENT_FALLBACK_ORDER,
  withSessionRetry,
} from "@/lib/youtube/client";
import type { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for long videos

/**
 * Server-side download endpoint.
 * Uses youtubei.js to download and pipes the ReadableStream directly to the response.
 * youtubei.js handles YouTube's SABR protocol and throttling internally.
 *
 * Query params:
 *   videoId: YouTube video ID
 *   formatSpec: itag or "itag+itag" for adaptive
 *   type: 'video+audio' | 'video' | 'audio'
 *   quality: '360p' | '720p' | '1080p' | 'best' etc
 *   format: 'mp4' | 'webm'
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get("videoId");
  const formatSpecParam = searchParams.get("formatSpec");
  const itag = searchParams.get("itag");
  const type = searchParams.get("type") ?? "video+audio";
  const quality = searchParams.get("quality") ?? "best";
  const format = searchParams.get("format") ?? "mp4";

  if (!videoId) {
    return new Response("Missing videoId parameter", { status: 400 });
  }

  try {
    const downloadType =
      type === "audio"
        ? ("audio" as const)
        : type === "video"
          ? ("video" as const)
          : ("video+audio" as const);

    const itagNum = formatSpecParam
      ? parseInt(formatSpecParam.split("+")[0], 10)
      : itag
        ? parseInt(itag, 10)
        : undefined;

    const stream = await withSessionRetry((yt) =>
      tryDownload(yt, videoId, downloadType, quality, format, itagNum)
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Transfer-Encoding", "chunked");

    return new Response(stream, { headers });
  } catch (error) {
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return new Response(message, { status: 500 });
  }
}

async function tryDownload(
  yt: Innertube,
  videoId: string,
  downloadType: "video" | "audio" | "video+audio",
  quality: string,
  format: string,
  itagNum: number | undefined
): Promise<ReadableStream<Uint8Array>> {
  let lastError: Error | null = null;

  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const stream = await yt.download(videoId, {
        client,
        type: downloadType,
        quality: quality === "best" ? "best" : quality,
        format,
        ...(itagNum && !isNaN(itagNum) ? { itag: itagNum } : {}),
      });

      if (stream) return stream;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Failed to start download");
}
