import { NextRequest } from "next/server";
import { getInnertube, CLIENT_FALLBACK_ORDER } from "@/lib/youtube/client";

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
    const yt = await getInnertube();

    // Determine download options for youtubei.js
    const downloadType =
      type === "audio"
        ? ("audio" as const)
        : type === "video"
          ? ("video" as const)
          : ("video+audio" as const);

    // If a specific itag/formatSpec was provided, use it directly
    const itagNum = formatSpecParam
      ? parseInt(formatSpecParam.split("+")[0], 10)
      : itag
        ? parseInt(itag, 10)
        : undefined;

    let stream: ReadableStream<Uint8Array> | null = null;
    let lastError: Error | null = null;

    // Try multiple client types to work around bot detection
    for (const client of CLIENT_FALLBACK_ORDER) {
      try {
        stream = await yt.download(videoId, {
          client,
          type: downloadType,
          quality: quality === "best" ? "best" : quality,
          format,
          ...(itagNum && !isNaN(itagNum) ? { itag: itagNum } : {}),
        });

        if (stream) break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Try next client
      }
    }

    if (!stream) {
      throw lastError ?? new Error("Failed to start download");
    }

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
