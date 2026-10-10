import { errorResponse } from "@/lib/errors";
import { readManifest } from "@/lib/media/manifest";
import { playbackCacheControl } from "@/lib/playback/freshness";
import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { readPlaybackSource, resolvePlayback } from "@/lib/playback/resolve";
import { rewriteMediaPlaylist } from "@/lib/media/hls";

export async function GET(request: NextRequest) {
  const source = readPlaybackSource(request.nextUrl.searchParams);
  const quality = request.nextUrl.searchParams.get("quality");

  if (!source || !quality) {
    return new Response("Missing or invalid parameters", { status: 400 });
  }

  try {
    const data = await resolvePlayback(source, request.signal);
    const selectedQuality = data.qualities.find((entry) => entry.key === quality);

    if (!selectedQuality) {
      debugServer("media.m3u8", "quality not found", { source, quality });
      return new Response("Quality not found", { status: 404 });
    }

    const manifest = await readManifest(selectedQuality.playlistUrl, request.signal);
    const playlistText = manifest.text;
    const rewritten = rewriteMediaPlaylist(
      playlistText,
      manifest.url ?? selectedQuality.playlistUrl,
      true
    );

    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": playbackCacheControl(manifest.complete ? "complete" : "growing"),
      },
    });
  } catch (error) {
    debugServer("media.m3u8", "failed to resolve vod", { source, quality });
    return errorResponse(error);
  }
}
