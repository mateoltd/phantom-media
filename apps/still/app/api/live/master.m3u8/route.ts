import { errorResponse } from "@/lib/errors";
import { readLiveManifest } from "@/lib/media/manifest";
import { NextRequest } from "next/server";
import { rewriteLiveMasterPlaylist } from "@/lib/media/hls";
import { getPlaybackLocation } from "@/lib/twitch/playback";

function normalizeChannel(value: string | null): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function GET(request: NextRequest) {
  const channel = normalizeChannel(request.nextUrl.searchParams.get("channel"));

  if (!channel || !/^[a-z0-9_]{3,25}$/.test(channel)) {
    return new Response("Missing or invalid channel", { status: 400 });
  }

  try {
    const playlistUrl = (await getPlaybackLocation("live", channel, request.signal)).url;
    const manifest = await readLiveManifest(playlistUrl, request.signal);
    const playlist = rewriteLiveMasterPlaylist(manifest.text, manifest.url);

    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
