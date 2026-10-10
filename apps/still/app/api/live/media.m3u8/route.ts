import { NextRequest } from "next/server";
import { rewriteLiveMediaPlaylist } from "@/lib/media/hls";
import { mediaDestination } from "@/lib/media/destination";
import { readLiveManifest } from "@/lib/media/manifest";
import { errorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  try { mediaDestination(parsed); } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!/\.m3u8$/i.test(parsed.pathname)) {
    return new Response("Invalid playlist", { status: 400 });
  }

  try {
    const manifest = await readLiveManifest(url, request.signal);
    return new Response(rewriteLiveMediaPlaylist(manifest.text, manifest.url), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) { return errorResponse(error); }
}
