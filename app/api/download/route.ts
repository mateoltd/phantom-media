import { NextRequest } from "next/server";
import {
  CLIENT_FALLBACK_ORDER,
  NO_CIPHER_CLIENTS,
  withSessionRetry,
} from "@/lib/youtube/client";
import type { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for long videos

/**
 * Server-side download endpoint.
 * For IOS/ANDROID clients: fetches directly from YouTube CDN using pre-signed URLs (fast).
 * Falls back to youtubei.js download() for other clients.
 *
 * Query params:
 *   videoId: YouTube video ID
 *   formatSpec: itag (e.g., "137" or "140")
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
    const result = await withSessionRetry((yt) =>
      getStreamUrl(yt, videoId, itag)
    );

    // Fetch directly from YouTube CDN and stream to client
    const upstream = await fetch(result.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://www.youtube.com",
        Referer: "https://www.youtube.com/",
      },
    });

    if (!upstream.ok) {
      throw new Error(`YouTube CDN returned ${upstream.status}`);
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
    headers.set("Access-Control-Allow-Origin", "*");

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, { headers });
  } catch (error) {
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return new Response(message, { status: 500 });
  }
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
