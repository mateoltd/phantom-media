import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { readPlaybackSource, resolvePlayback } from "@/lib/resolve";
import { generateMasterPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const source = readPlaybackSource(request.nextUrl.searchParams);

  if (!source) {
    return new Response("Missing or invalid vodId", { status: 400 });
  }

  try {
    const data = await resolvePlayback(source);
    debugServer("master.m3u8", "serving master playlist", {
      source,
      qualityKeys: data.qualities.map((quality) => quality.key),
    });
    const playlist = generateMasterPlaylist(source, data.qualities);

    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        // An archive URL names the channel, not the broadcast, so it points somewhere new each stream.
        "Cache-Control": "archive" in source ? "no-store" : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    debugServer("master.m3u8", "failed to resolve vod", { source });
    return new Response("VOD not found", { status: 404 });
  }
}
