import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { resolveVod } from "@/lib/resolve";
import { rewriteMediaPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId");
  const quality = request.nextUrl.searchParams.get("quality");

  if (!vodId || !/^\d+$/.test(vodId) || !quality) {
    return new Response("Missing or invalid parameters", { status: 400 });
  }

  try {
    const data = await resolveVod(vodId);
    const selectedQuality = data.qualities.find((entry) => entry.key === quality);

    if (!selectedQuality) {
      debugServer("media.m3u8", "quality not found", { vodId, quality });
      return new Response("Quality not found", { status: 404 });
    }

    const upstream = await fetch(selectedQuality.playlistUrl, {
      cache: "no-store",
    });

    if (!upstream.ok) {
      debugServer("media.m3u8", "upstream playlist error", {
        vodId,
        quality,
        status: upstream.status,
        playlistUrl: selectedQuality.playlistUrl,
      });
      return new Response("Upstream playlist error", { status: upstream.status });
    }

    debugServer("media.m3u8", "serving media playlist", {
      vodId,
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
    debugServer("media.m3u8", "failed to resolve vod", { vodId, quality });
    return new Response("VOD not found", { status: 404 });
  }
}
