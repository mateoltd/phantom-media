import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { readPlaybackSource, resolvePlayback } from "@/lib/resolve";
import { rewriteMediaPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const source = readPlaybackSource(request.nextUrl.searchParams);
  const quality = request.nextUrl.searchParams.get("quality");

  if (!source || !quality) {
    return new Response("Missing or invalid parameters", { status: 400 });
  }

  try {
    const data = await resolvePlayback(source);
    const selectedQuality = data.qualities.find((entry) => entry.key === quality);

    if (!selectedQuality) {
      debugServer("media.m3u8", "quality not found", { source, quality });
      return new Response("Quality not found", { status: 404 });
    }

    const upstream = await fetch(selectedQuality.playlistUrl, {
      cache: "no-store",
    });

    if (!upstream.ok) {
      debugServer("media.m3u8", "upstream playlist error", {
        source,
        quality,
        status: upstream.status,
        playlistUrl: selectedQuality.playlistUrl,
      });
      return new Response("Upstream playlist error", { status: upstream.status });
    }

    debugServer("media.m3u8", "serving media playlist", {
      source,
      quality,
      playlistUrl: selectedQuality.playlistUrl,
    });
    const playlistText = await upstream.text();
    const isCompleteVod = playlistText.includes("#EXT-X-ENDLIST");
    const rewritten = rewriteMediaPlaylist(
      playlistText,
      selectedQuality.playlistUrl,
      true
    );

    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": isCompleteVod
          ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
          : "no-store",
      },
    });
  } catch {
    debugServer("media.m3u8", "failed to resolve vod", { source, quality });
    return new Response("VOD not found", { status: 404 });
  }
}
