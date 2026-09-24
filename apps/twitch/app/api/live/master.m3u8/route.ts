import { NextRequest } from "next/server";
import { rewriteLiveMasterPlaylist } from "@/lib/playlist";
import { fetchLivePlaybackUrl } from "@/lib/twitch";

function normalizeChannel(value: string | null): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function GET(request: NextRequest) {
  const channel = normalizeChannel(request.nextUrl.searchParams.get("channel"));

  if (!channel || !/^[a-z0-9_]{3,25}$/.test(channel)) {
    return new Response("Missing or invalid channel", { status: 400 });
  }

  try {
    const playlistUrl = await fetchLivePlaybackUrl(channel);
    const upstream = await fetch(playlistUrl, { cache: "no-store" });

    if (!upstream.ok) {
      return new Response("Live stream unavailable", { status: upstream.status });
    }

    const playlist = rewriteLiveMasterPlaylist(await upstream.text(), playlistUrl);

    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Live stream unavailable", { status: 404 });
  }
}
