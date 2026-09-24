import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";
import { resolveVod } from "@/lib/resolve";
import { generateMasterPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId");

  if (!vodId || !/^\d+$/.test(vodId)) {
    return new Response("Missing or invalid vodId", { status: 400 });
  }

  try {
    const data = await resolveVod(vodId);
    debugServer("master.m3u8", "serving master playlist", {
      vodId,
      qualityKeys: data.qualities.map((quality) => quality.key),
    });
    const playlist = generateMasterPlaylist(vodId, data.qualities);

    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    debugServer("master.m3u8", "failed to resolve vod", { vodId });
    return new Response("VOD not found", { status: 404 });
  }
}
