import { errorResponse } from "@/lib/errors";
import { playbackCacheControl } from "@/lib/playback/freshness";
import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { readPlaybackSource, resolvePlayback } from "@/lib/playback/resolve";
import { playbackPlaylist } from "@/lib/media/presentation";

export async function GET(request: NextRequest) {
  const source = readPlaybackSource(request.nextUrl.searchParams);

  if (!source) {
    return new Response("Missing or invalid vodId", { status: 400 });
  }

  try {
    const data = await resolvePlayback(source, request.signal);
    debugServer("master.m3u8", "serving master playlist", {
      source,
      qualityKeys: data.qualities.map((quality) => quality.key),
    });
    const mode = request.nextUrl.searchParams.get("mode") === "audio" ? "audio" : "video";
    const playlist = await playbackPlaylist(source, data.qualities, mode, request.nextUrl.searchParams.get("quality"), request.signal);
    const cacheControl = playbackCacheControl(data.lifecycle);
    if (playlist.kind === "media-redirect") {
      // request.url can contain the server's bind address behind Next or a proxy.
      // Keep the redirect on the browser's origin, including LAN/Tailscale hosts.
      const query = new URLSearchParams({ ...source, quality: playlist.quality });
      return new Response(null, { status: 307, headers: { Location: `/api/vod/media.m3u8?${query}`, "Cache-Control": cacheControl } });
    }

    return new Response(playlist.text, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    debugServer("master.m3u8", "failed to resolve vod", { source });
    return errorResponse(error);
  }
}
