import { NextRequest } from "next/server";
import { rewriteLiveMediaPlaylist } from "@/lib/playlist";

const ALLOWED_HOSTS = [
  /^[a-z0-9-]+\.twitch\.tv$/,
  /^[a-z0-9-]+\.ttvnw\.net$/,
  /^[a-z0-9-]+\.playlist\.ttvnw\.net$/,
  /^[a-z0-9.-]+\.hls\.ttvnw\.net$/,
  /^[a-z0-9]+\.cloudfront\.net$/,
];

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

  if (!ALLOWED_HOSTS.some((host) => host.test(parsed.hostname))) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok) {
    return new Response("Upstream playlist error", { status: upstream.status });
  }

  const rewritten = rewriteLiveMediaPlaylist(await upstream.text(), url);

  return new Response(rewritten, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
    },
  });
}
