import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { proxyMedia } from "../lib/media-proxy.ts";

afterEach(() => mock.restoreAll());

function request(url, headers) {
  return new Request(`https://example.com/api/proxy?url=${encodeURIComponent(url)}`, { headers });
}

test("streams a segment without waiting for its body and preserves range metadata", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); } });
  const upstream = new Response(body, {
    status: 206,
    headers: { "Content-Type": "video/mp2t", "Content-Range": "bytes 0-2/10", "Content-Length": "3", "Accept-Ranges": "bytes", ETag: '"segment"' },
  });
  const req = request("https://d3stzm2eumvgb4.cloudfront.net/vod/0.ts", { Range: "bytes=0-2" });
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://d3stzm2eumvgb4.cloudfront.net/vod/0.ts");
    assert.equal(options.headers.get("Range"), "bytes=0-2");
    assert.equal(options.signal, req.signal);
    return upstream;
  });
  const response = await proxyMedia(req);
  assert.equal(response.body, body);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-2/10");
  assert.equal(response.headers.get("Content-Length"), "3");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("ETag"), '"segment"');
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=86400, immutable");
  await response.body.cancel();
});

test("keeps a short cache lifetime for playlists", async () => {
  mock.method(globalThis, "fetch", async () => new Response("#EXTM3U"));
  const response = await proxyMedia(request("https://vod-secure.twitch.tv/vod/index.m3u8"));
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(await response.text(), "#EXTM3U");
});

test("rejects invalid or disallowed destinations before fetching", async () => {
  const fetch = mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  assert.equal((await proxyMedia(new Request("https://example.com/api/proxy"))).status, 400);
  for (const [url, status] of [
    ["not a URL", 400],
    ["http://vod-secure.twitch.tv/0.ts", 403],
    ["https://example.com/0.ts", 403],
    ["https://vod-secure.twitch.tv.example.com/0.ts", 403],
  ]) {
    assert.equal((await proxyMedia(request(url))).status, status);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("upstream HTTP failures retain their status without caching the error", async () => {
  let cancelled = false;
  mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 }));
  const response = await proxyMedia(request("https://video-edge.ttvnw.net/0.ts"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), null);
  assert.equal(cancelled, true);
});

test("a failed upstream connection returns a retryable gateway error", async () => {
  mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const response = await proxyMedia(request("https://video-edge.ttvnw.net/0.ts"));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), null);
});
