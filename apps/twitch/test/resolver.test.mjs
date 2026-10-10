import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { resolveVod } from "../lib/playback/resolve.ts";
import { cdnLocation, cdnPlaylistUrl } from "../lib/playback/cdn.ts";
import { generateMasterPlaylist } from "../lib/media/hls.ts";
import { parseMediaManifest, readManifest } from "../lib/media/manifest.ts";
import { ResourceCache } from "../lib/cache.ts";

const playlist = "#EXTM3U\n#EXT-X-TARGETDURATION:12\n#EXTINF:12,\n0.ts\n#EXT-X-ENDLIST\n";
afterEach(() => mock.restoreAll());
const metadata = id => ({ id, owner: { login: "fixture" }, title: "Fixture", createdAt: "2026-10-01T00:00:00Z", broadcastType: "ARCHIVE", seekPreviewsURL: `https://fixture.cloudfront.net/${id}/storyboards/info.json` });

test("completed and growing keyless archives survive unavailable optional Usher attributes", async () => {
  for (const [id, growing] of [["2000000001", false], ["2000000002", true]]) {
    let tokens = 0;
    mock.method(globalThis, "fetch", async (url, init) => {
      if (String(url).includes("gql.twitch.tv")) {
        const { query } = JSON.parse(init.body);
        if (query.includes("VideoMetadata")) return Response.json({ data: { video: metadata(id) } });
        if (query.includes("ChannelBasics")) return Response.json({ data: { user: { login: "fixture", stream: growing ? { archiveVideo: { id } } : null } } });
        tokens++; return Response.json({ data: { videoPlaybackAccessToken: null } });
      }
      return String(url).includes("/chunked/") ? new Response(growing ? playlist.replace("#EXT-X-ENDLIST\n", "") : playlist) : new Response(null, { status: 403 });
    });
    const result = await resolveVod(id);
    assert.equal(tokens, 1); assert.equal(result.lifecycle, growing ? "growing" : "complete");
    assert.equal(result.qualities[0].metadata, "unknown"); assert.equal(result.qualities[0].resolution, undefined);
    assert.equal(result.playback.source, "cdn"); mock.restoreAll();
  }
});

test("missing storyboard locator does not prevent independent Usher playback", async () => {
  const id = "2000000003";
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("gql.twitch.tv")) {
      const { query } = JSON.parse(init.body);
      if (query.includes("VideoMetadata")) return Response.json({ data: { video: { ...metadata(id), seekPreviewsURL: null } } });
      if (query.includes("ChannelBasics")) return Response.json({ data: { user: null } });
      return Response.json({ data: { videoPlaybackAccessToken: { value: "{}", signature: "fixture" } } });
    }
    if (String(url).includes("usher.ttvnw.net")) return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",VIDEO="720p60"\nhttps://video-edge.ttvnw.net/test-usher/index.m3u8\n');
    return new Response(playlist);
  });
  const result = await resolveVod(id); assert.equal(result.playback.source, "usher"); assert.equal(result.qualities[0].resolution, "1280x720");
});

test("unplayable media retains metadata rather than discarding the resource", async () => {
  const id = "2000000004";
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (init.body) { const { query } = JSON.parse(init.body); return Response.json({ data: query.includes("VideoMetadata") ? { video: metadata(id) } : query.includes("ChannelBasics") ? { user: null } : { videoPlaybackAccessToken: null } }); }
    return new Response(null, { status: 403 });
  });
  const result = await resolveVod(id); assert.equal(result.title, "Fixture"); assert.equal(result.playback.state, "unavailable"); assert.deepEqual(result.qualities, []);
});

test("validated CDN locations preserve specialized non-archive formulas", () => {
  assert.equal(cdnLocation({ ...metadata("123"), seekPreviewsURL: "https://attacker.example/folder/storyboards/info.json" }), null);
  const location = cdnLocation(metadata("123"));
  assert.ok(cdnPlaylistUrl({ ...location, broadcastType: "highlight" }, "123", "chunked", "2026-01-01").endsWith("highlight-123.m3u8"));
  assert.ok(cdnPlaylistUrl({ ...location, broadcastType: "upload" }, "123", "chunked", "2026-01-01").includes("/fixture/123/123/"));
  assert.equal(cdnPlaylistUrl({ ...location, broadcastType: "past_premiere" }, "123", "chunked", "2026-01-01"), null);
});

test("video masters never emit audio-only streams or fabricate their attributes", () => {
  const text = generateMasterPlaylist({ vodId: "1" }, [{ key: "audio_only", name: "Audio Only", kind: "audio", isAudioOnly: true, delivery: "hls", playlistUrl: "", metadata: "unknown" }]);
  assert.ok(!/STREAM-INF|RESOLUTION|FRAME-RATE|CODECS|audio_only/.test(text));
  assert.equal(parseMediaManifest(playlist.replace("#EXT-X-ENDLIST", "#EXT-X-PLAYLIST-TYPE:EVENT")).complete, false);
});

test("completed manifests revalidate by etag; growing manifests never freeze", async () => {
  let now = 0; mock.method(Date, "now", () => now); let calls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    calls++;
    if (calls === 2) { assert.equal(init.headers.get("If-None-Match"), '"stable"'); return new Response(null, { status: 304 }); }
    return new Response(playlist, { headers: { ETag: '"stable"' } });
  });
  const url = "https://fixture.cloudfront.net/cache-fixture/index.m3u8";
  await readManifest(url); await readManifest(url); assert.equal(calls, 1); now = 31000; await readManifest(url); assert.equal(calls, 2);
});

test("one cancelled waiter does not cancel a coalesced resource load", async () => {
  const cache = new ResourceCache(2); const controller = new AbortController(); let finish; let loads = 0;
  const loader = () => { loads++; return new Promise(resolve => finish = resolve); };
  const a = cache.load("one", loader, 1000, controller.signal); const b = cache.load("one", loader, 1000);
  await Promise.resolve(); controller.abort(); finish("ok");
  await assert.rejects(a); assert.equal(await b, "ok"); assert.equal(loads, 1);
});
