import { NextRequest } from "next/server";
import { debugServer } from "@/lib/debug";

const ALLOWED_HOSTS = [
  /^[a-z0-9-]+\.twitch\.tv$/,
  /^[a-z0-9-]+\.ttvnw\.net$/,
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

  if (!ALLOWED_HOSTS.some((r) => r.test(parsed.hostname))) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }

  const upstream = await fetch(url, {
    headers: upstreamHeaders,
    cache: "no-store",
  });
  if (!upstream.ok) {
    debugServer("proxy", "upstream error", {
      url,
      status: upstream.status,
      range,
    });
    return new Response("Upstream error", { status: upstream.status });
  }

  // Segments have versioned URLs (content-addressed) — safe to cache aggressively.
  // Playlists can change, so use a short TTL.
  const isSegment = !parsed.pathname.endsWith(".m3u8");
  const cacheControl = isSegment
    ? "public, max-age=86400, immutable"
    : "public, max-age=300";

  const responseHeaders = new Headers({
    "Content-Type":
      upstream.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": cacheControl,
  });

  for (const header of [
    "Accept-Ranges",
    "Content-Length",
    "Content-Range",
    "ETag",
    "Last-Modified",
  ]) {
    const value = upstream.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
