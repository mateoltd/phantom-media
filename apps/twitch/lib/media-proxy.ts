const ALLOWED_HOSTS = [
  /^[a-z0-9-]+\.twitch\.tv$/,
  /^[a-z0-9-]+\.ttvnw\.net$/,
  /^[a-z0-9]+\.cloudfront\.net$/,
];

/** Keep media on the Fetch stream so large segments never pass through Next's Node response adapter. */
export async function proxyMedia(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.some((host) => host.test(parsed.hostname))) {
    return new Response("Forbidden", { status: 403 });
  }

  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetch(parsed, { headers, signal: request.signal, cache: "no-store" });
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }

  if (!upstream.ok) {
    await upstream.body?.cancel();
    return new Response("Upstream error", { status: upstream.status });
  }

  const responseHeaders = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": parsed.pathname.endsWith(".m3u8")
      ? "public, max-age=300"
      : "public, max-age=86400, immutable",
  });

  for (const header of ["Accept-Ranges", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
