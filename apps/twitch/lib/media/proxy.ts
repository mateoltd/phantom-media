import "../server-boundary.ts";
import { fetchMedia, mediaDestination } from "./destination.ts";

const FORWARDED = ["Accept-Ranges", "Content-Length", "Content-Range", "ETag", "Last-Modified"];

/** Stream media directly in the Worker; only an unmuted candidate gets a bounded prefix check. */
export async function proxyMedia(request: Request): Promise<Response> {
  const value = new URL(request.url).searchParams.get("url");
  if (!value) return new Response("Missing url", { status: 400 });
  let url: URL;
  try { new URL(value); } catch { return new Response("Invalid url", { status: 400 }); }
  try { url = mediaDestination(value); } catch { return new Response("Forbidden", { status: 403 }); }
  const headers = new Headers();
  for (const name of ["Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let response: Response;
  let fallback = false;
  try {
    response = await fetchMedia(url, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, signal: request.signal });
    if (/\/\d+-unmuted\.ts$/.test(url.pathname)) {
      let stub = (response.status === 200 && response.headers.get("Content-Length") === "111") || (response.status === 206 && /^bytes \d+-\d+\/111$/.test(response.headers.get("Content-Range") ?? ""));
      if (!stub && response.status === 200 && !headers.has("Range") && request.method !== "HEAD" && !response.headers.has("Content-Length")) {
        const inspected = await inspectStub(response);
        response = inspected.response;
        stub = inspected.stub;
      }
      if (stub || response.status === 403 || response.status === 404) {
        await response.body?.cancel();
        const muted = new URL(url);
        muted.pathname = muted.pathname.replace(/-unmuted\.ts$/, "-muted.ts");
        // Original and silent fallback are different representations; do not forward its validators.
        const fallbackHeaders = new Headers(headers);
        fallbackHeaders.delete("If-Range"); fallbackHeaders.delete("If-None-Match"); fallbackHeaders.delete("If-Modified-Since");
        response = await fetchMedia(muted, { method: request.method === "HEAD" ? "HEAD" : "GET", headers: fallbackHeaders, signal: request.signal });
        fallback = true;
      }
    }
  } catch { return new Response("Upstream unavailable", { status: 502, headers: { "Cache-Control": "no-store" } }); }
  if (!response.ok && response.status !== 304) {
    await response.body?.cancel();
    return new Response("Upstream error", { status: response.status, headers: { "Cache-Control": "no-store" } });
  }
  const signed = url.searchParams.has("sig") || url.searchParams.has("token");
  const mutable = /\.(?:m3u8|json)$/.test(url.pathname) || url.hostname === "static-cdn.jtvnw.net" && /\/live_user_/.test(url.pathname);
  const output = new Headers({ "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": signed || mutable ? "no-store" : fallback ? "public, max-age=30, must-revalidate" : "public, max-age=86400, immutable" });
  if (/\.m3u8$/i.test(url.pathname)) output.set("X-Phantom-Media-URL", response.url || url.href);
  for (const name of FORWARDED) {
    const value = response.headers.get(name);
    if (value) output.set(name, value);
  }
  if (fallback) output.set("X-Phantom-Audio", "silent-fallback");
  return new Response(request.method === "HEAD" || response.status === 304 ? null : response.body, { status: response.status, headers: output });
}

async function inspectStub(response: Response): Promise<{ stub: boolean; response: Response }> {
  const reader = response.body?.getReader();
  if (!reader) return { stub: false, response };
  const prefix: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  while (size < 188) {
    const next = await reader.read();
    if (next.done) { ended = true; break; }
    prefix.push(next.value); size += next.value.byteLength;
  }
  if (ended && size === 111) { reader.releaseLock(); return { stub: true, response: new Response(null, response) }; }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (prefix.length) { controller.enqueue(prefix.shift()!); return; }
      if (ended) { reader.releaseLock(); controller.close(); return; }
      try {
        const next = await reader.read();
        if (next.done) { reader.releaseLock(); controller.close(); } else controller.enqueue(next.value);
      } catch (error) { reader.releaseLock(); controller.error(error); }
    },
    async cancel(reason) { if (!ended) await reader.cancel(reason); reader.releaseLock(); },
  });
  return { stub: false, response: new Response(body, response) };
}
