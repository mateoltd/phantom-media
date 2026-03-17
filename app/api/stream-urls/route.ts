import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_FALLBACK_ORDER,
  withSessionRetry,
} from "@/lib/youtube/client";
import type { Innertube } from "youtubei.js";

export const runtime = "nodejs";

/**
 * Lightweight URL resolver — uses youtubei.js to get deciphered stream URLs.
 *
 * POST body: { videoId, formatSpec }
 *   formatSpec: itag string like "137" or "137+140"
 *
 * Returns: { urls: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { videoId, formatSpec } = await request.json();

    if (!videoId || !formatSpec) {
      return NextResponse.json(
        { error: "Missing videoId or formatSpec" },
        { status: 400 }
      );
    }

    const urls = await withSessionRetry((yt) =>
      resolveUrls(yt, videoId, formatSpec)
    );
    return NextResponse.json({ urls });
  } catch (error) {
    console.error("stream-urls error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to resolve URLs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function resolveUrls(
  yt: Innertube,
  videoId: string,
  formatSpec: string
): Promise<string[]> {
  const itags = formatSpec.split("+").map((s) => parseInt(s.trim(), 10));

  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const streaming = info.streaming_data;

      if (!streaming) continue;

      const allFormats = [
        ...(streaming.formats ?? []),
        ...(streaming.adaptive_formats ?? []),
      ];

      const urls: string[] = [];

      for (const itag of itags) {
        const format = allFormats.find((f) => f.itag === itag);
        if (!format) continue;

        const url = await format.decipher(yt.session.player);
        if (url) urls.push(url);
      }

      if (urls.length > 0) return urls;
    } catch {
      // Try next client
    }
  }

  throw new Error("No URLs could be resolved for the given format");
}
