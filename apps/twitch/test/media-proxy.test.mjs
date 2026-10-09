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

for (const status of [403, 404]) {
  test(`falls back to the muted VOD segment after an upstream ${status}`, async () => {
    const originalUrl = "https://d3stzm2eumvgb4.cloudfront.net/vod/720p60/1394-unmuted.ts?token=example";
    const mutedUrl = originalUrl.replace("1394-unmuted.ts", "1394-muted.ts");
    const req = request(originalUrl, { Range: "bytes=0-2" });
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); } });
    const fetch = mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(options.headers.get("Range"), "bytes=0-2");
      assert.equal(options.signal, req.signal);
      assert.equal(options.cache, "no-store");
      if (String(url) === originalUrl) {
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
      }
      assert.equal(String(url), mutedUrl);
      assert.equal(cancelled, true);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": "video/mp2t",
          "Content-Range": "bytes 0-2/10",
          "Content-Length": "3",
          "Accept-Ranges": "bytes",
          ETag: '"muted-segment"',
          "Last-Modified": "Thu, 08 Oct 2026 21:09:42 GMT",
        },
      });
    });
    const response = await proxyMedia(req);
    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(response.body, body);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Type"), "video/mp2t");
    assert.equal(response.headers.get("Content-Range"), "bytes 0-2/10");
    assert.equal(response.headers.get("Content-Length"), "3");
    assert.equal(response.headers.get("Accept-Ranges"), "bytes");
    assert.equal(response.headers.get("ETag"), '"muted-segment"');
    assert.equal(response.headers.get("Last-Modified"), "Thu, 08 Oct 2026 21:09:42 GMT");
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
    await response.body.cancel();
  });
}

test("preserves an available unmuted segment without requesting the muted copy", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => new Response("original audio"));
  const response = await proxyMedia(request("https://vod-secure.twitch.tv/vod/1394-unmuted.ts"));
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(await response.text(), "original audio");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=86400, immutable");
});

test("does not try muted variants for unrelated HTTP errors or resources", async () => {
  for (const [path, status] of [
    ["1394-unmuted.ts", 401],
    ["1394-unmuted.ts", 429],
    ["1394-unmuted.ts", 503],
    ["1394.ts", 403],
    ["1394-muted.ts", 404],
    ["index-unmuted.m3u8", 403],
    ["1394-unmuted.ts/other.ts", 404],
    ["1394.ts?token=1394-unmuted.ts", 403],
  ]) {
    const fetch = mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    const response = await proxyMedia(request(`https://video-edge.ttvnw.net/vod/${path}`));
    assert.equal(response.status, status);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(response.headers.get("Cache-Control"), null);
    mock.restoreAll();
  }
});

test("returns the muted fallback failure without caching it or retrying again", async () => {
  let cancelled = 0;
  const fetch = mock.method(globalThis, "fetch", async () => new Response(
    new ReadableStream({ cancel() { cancelled += 1; } }),
    { status: cancelled === 0 ? 403 : 404 },
  ));
  const response = await proxyMedia(request("https://vod-secure.twitch.tv/vod/1394-unmuted.ts"));
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Upstream error");
  assert.equal(response.headers.get("Cache-Control"), null);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(cancelled, 2);
});

test("a failed fallback connection returns a retryable gateway error", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) return new Response(null, { status: 403 });
    throw new TypeError("fetch failed");
  });
  const response = await proxyMedia(request("https://vod-secure.twitch.tv/vod/1394-unmuted.ts"));
  assert.equal(response.status, 502);
  assert.equal(calls, 2);
  assert.equal(response.headers.get("Cache-Control"), null);
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
