import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { readFileSync } from "node:fs";
import { proxyMedia } from "../lib/media/proxy.ts";
import { mediaDestination } from "../lib/media/destination.ts";
import { readLiveManifest, readManifest } from "../lib/media/manifest.ts";
import { rewriteLiveMediaPlaylist, rewriteMediaPlaylist } from "../lib/media/hls.ts";

afterEach(() => mock.restoreAll());
const base = "https://video-edge.ttvnw.net/recording/";
const req = (path, headers) => new Request(`https://app.example/api/proxy?url=${encodeURIComponent(base + path)}`, { headers });
const stubBytes = JSON.parse(readFileSync(new URL("./fixtures/research/round15/mute-IN-WINDOW.json", import.meta.url))).bytes;

test("ordinary Range media streams immediately with representation validators", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([7])); } });
  mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.headers.get("Range"), "bytes=0-0");
    assert.equal(init.headers.get("If-Range"), '"one"');
    assert.equal(init.redirect, "manual");
    return new Response(body, { status: 206, headers: { "Content-Range": "bytes 0-0/100", "Content-Length": "1", "Accept-Ranges": "bytes", ETag: '"one"' } });
  });
  const response = await proxyMedia(req("0.ts", { Range: "bytes=0-0", "If-Range": '"one"' }));
  assert.equal(response.body, body);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-0/100");
  assert.equal(response.headers.get("ETag"), '"one"');
  await response.body.cancel();
});

for (const contentLength of [true, false]) test(`200 audio-empty stub falls back (length header: ${contentLength})`, async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async url => {
    calls++;
    if (String(url).endsWith("9-unmuted.ts")) return new Response(new Uint8Array(stubBytes), { headers: contentLength ? { "Content-Length": String(stubBytes) } : {} });
    assert.ok(String(url).endsWith("9-muted.ts"));
    return new Response(new Uint8Array(188), { headers: { "Content-Type": "video/mp2t" } });
  });
  const response = await proxyMedia(req("9-unmuted.ts"));
  assert.equal(calls, 2);
  assert.equal((await response.arrayBuffer()).byteLength, 188);
  assert.equal(response.headers.get("X-Phantom-Audio"), "silent-fallback");
});

test("a small partial response is not confused with an audio-empty whole segment", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return new Response(new Uint8Array(stubBytes), { status: 206, headers: { "Content-Length": String(stubBytes), "Content-Range": "bytes 0-110/5000" } }); });
  const response = await proxyMedia(req("10-unmuted.ts", { Range: "bytes=0-110" }));
  assert.equal(calls, 1); assert.equal(response.status, 206); await response.body.cancel();
});

test("inaccessible originals use silent fallback but do not carry original validators", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (++calls === 1) return new Response(null, { status: 403 });
    assert.equal(init.headers.get("If-Range"), null);
    assert.equal(init.headers.get("Range"), "bytes=188-");
    return new Response(new Uint8Array(188), { status: 206, headers: { ETag: '"muted"' } });
  });
  const response = await proxyMedia(req("11-unmuted.ts", { Range: "bytes=188-", "If-Range": '"original"' }));
  assert.equal(response.headers.get("ETag"), '"muted"'); await response.body.cancel();
});

test("signed locations and mutable manifests are never advertised as immutable", async () => {
  mock.method(globalThis, "fetch", async () => new Response("media"));
  for (const path of ["clip.mp4?sig=test&token=test", "index-dvr.m3u8", "storyboards/info.json"]) {
    const response = await proxyMedia(req(path));
    assert.equal(response.headers.get("Cache-Control"), "no-store"); await response.body.cancel();
  }
});

test("redirects cannot turn the media route into an unrestricted fetcher", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 302, headers: { Location: "https://example.com/private.mp4" } }); });
  assert.equal((await proxyMedia(req("redirect.mp4"))).status, 502); assert.equal(calls, 1);
  const invalid = new Request("https://app.example/api/proxy?url=" + encodeURIComponent("https://user:password@video-edge.ttvnw.net/a.mp4"));
  assert.equal((await proxyMedia(invalid)).status, 403); assert.equal(calls, 1);
});

test("HTTP failures preserve status with no retry or error caching", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 429 }); });
  const response = await proxyMedia(req("12-unmuted.ts"));
  assert.equal(response.status, 429); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(calls, 1);
});

test("live manifests retain nested Twitch CDN hosts and accept not-yet-complete LL-HLS", async () => {
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-PART:DURATION=0.5,URI="part.mp4"\n';
  let calls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    calls++;
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    return new Response(text);
  });
  for (const host of ["video-edge.playlist.ttvnw.net", "video.edge.hls.ttvnw.net"]) {
    assert.equal((await readLiveManifest(`https://${host}/live.m3u8`)).text, text);
  }
  assert.equal(calls, 2);
  for (const value of ["http://video-edge.ttvnw.net/live.m3u8", "https://user:pass@video-edge.ttvnw.net/live.m3u8", "https://video-edge.ttvnw.net:8443/live.m3u8"]) {
    assert.throws(() => mediaDestination(value));
  }
});

test("allowed redirects retain the final playlist base for live, VOD and download media", async () => {
  const original = `${base}old/live.m3u8`;
  const final = `${base}new/live.m3u8`;
  const text = '#EXTM3U\n#EXTINF:2,\npart.ts\n#EXT-X-ENDLIST\n';
  mock.method(globalThis, "fetch", async url => {
    if (String(url) === original) return new Response(null, { status: 302, headers: { Location: "../new/live.m3u8" } });
    assert.equal(String(url), final);
    const response = new Response(text);
    Object.defineProperty(response, "url", { value: final });
    return response;
  });
  const live = await readLiveManifest(original);
  assert.ok(rewriteLiveMediaPlaylist(live.text, live.url).includes(`${base}new/part.ts`));
  const vod = await readManifest(original);
  assert.ok(rewriteMediaPlaylist(vod.text, vod.url).includes(`${base}new/part.ts`));
  const response = await proxyMedia(new Request(`https://app.example/api/proxy?url=${encodeURIComponent(original)}`));
  assert.equal(response.headers.get("X-Phantom-Media-URL"), final);
  await response.body.cancel();
});

test("304 revalidation preserves the body but moves relative segments to the new redirect base", async () => {
  const original = `${base}redirect-revalidation.m3u8`;
  const text = '#EXTM3U\n#EXTINF:2,\npart.ts\n#EXT-X-ENDLIST\n';
  let now = Date.now(), calls = 0;
  mock.method(Date, "now", () => now);
  mock.method(globalThis, "fetch", async (_url, init) => {
    const first = calls++ === 0;
    if (!first) assert.equal(init.headers.get("If-None-Match"), '"stable"');
    const response = new Response(first ? text : null, { status: first ? 200 : 304, headers: { ETag: '"stable"' } });
    Object.defineProperty(response, "url", { value: `${base}${first ? "old" : "new"}/index.m3u8` });
    return response;
  });
  assert.equal((await readManifest(original)).url, `${base}old/index.m3u8`);
  now += 31_000;
  const manifest = await readManifest(original);
  assert.equal(manifest.text, text);
  assert.equal(manifest.etag, '"stable"');
  assert.ok(rewriteMediaPlaylist(manifest.text, manifest.url).includes(`${base}new/part.ts`));
  assert.equal(calls, 2);
});

test("live manifest redirects, bytes and caller cancellation stay bounded", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: "https://example.com/live.m3u8" } });
  });
  await assert.rejects(readLiveManifest(`${base}live.m3u8`));
  assert.equal(calls, 1);
  mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(512 * 1024 + 1)));
  await assert.rejects(readLiveManifest(`${base}oversize.m3u8`), error => error.kind === "cap");
  let cancelled = false;
  const controller = new AbortController();
  mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.signal.aborted, false);
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  });
  const pending = readLiveManifest(`${base}stalled.m3u8`, controller.signal);
  setImmediate(() => controller.abort());
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(cancelled, true);
});
