import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, mock, test } from "node:test";
import { resolveVod } from "../lib/playback/resolve.ts";
import { parseUsherMaster } from "../lib/playback/usher.ts";
import { mergeCdnAttributes } from "../lib/playback/attributes.ts";
import { generateMasterPlaylist } from "../lib/media/hls.ts";
import { playbackPlaylist } from "../lib/media/presentation.ts";
import { videoVariants, videoQualityLabel } from "../lib/media/variants.ts";

const id = "2895228400";
const source = { vodId: id };
const root = new URL("./fixtures/audio-abr/", import.meta.url);
const master = readFileSync(new URL("usher-master.m3u8", root), "utf8");
const metadata = JSON.parse(readFileSync(new URL("metadata.json", root)));
const media = "#EXTM3U\n#EXT-X-TARGETDURATION:12\n#EXTINF:12,\n0.ts\n#EXT-X-ENDLIST\n";
const observed = () => parseUsherMaster(master, "https://usher.ttvnw.net/vod/v2/2895228400.m3u8");
afterEach(() => mock.restoreAll());

test("miraieta 2895228400 resolves one real video rendition and one explicit audio rendition", async () => {
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("gql.twitch.tv")) {
      const { query } = JSON.parse(init.body);
      if (query.includes("VideoMetadata")) return Response.json(metadata);
      if (query.includes("ChannelBasics")) return Response.json({ data: { user: null } });
      return Response.json({ data: { videoPlaybackAccessToken: { value: "{}", signature: "fixture" } } });
    }
    if (String(url).includes("usher.ttvnw.net")) return new Response(master);
    return /\/(?:chunked|audio_only)\//.test(String(url)) ? new Response(media) : new Response(null, { status: 403 });
  });
  const data = await resolveVod(id);
  assert.equal(data.playback.source, "cdn");
  const videos = videoVariants(data.qualities);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].resolution, "1920x1080");
  assert.equal(videos[0].frameRate, 60);
  assert.equal(videos[0].codec, "avc1.64002A,mp4a.40.2");
  const audio = data.qualities.find(variant => variant.isAudioOnly);
  assert.equal(audio.name, "Audio Only");
  assert.equal(audio.codec, "mp4a.40.2");
  assert.equal(audio.bandwidth, 218597);
  assert.equal(audio.resolution, undefined);
  assert.equal(audio.frameRate, undefined);
  assert.ok(data.qualities.every(variant => variant.playlistUrl.startsWith("https://fixture.cloudfront.net/")));
  const output = generateMasterPlaylist(source, data.qualities);
  assert.equal(output.match(/#EXT-X-STREAM-INF:/g).length, 1);
  assert.ok(output.includes('CODECS="avc1.64002A,mp4a.40.2"'));
  assert.ok(!output.includes("audio_only"));
});

test("audio remains an explicit media path, never a video ABR candidate", async () => {
  mock.method(globalThis, "fetch", async () => new Response(media));
  const audio = await playbackPlaylist(source, observed(), "audio");
  assert.equal(audio.kind, "playlist");
  assert.ok(audio.text.includes("#EXTINF:12,"));
  assert.ok(audio.text.includes("audio_only"));
  assert.ok(!audio.text.includes("#EXT-X-STREAM-INF:"));
  await assert.rejects(playbackPlaylist(source, observed(), "video", "usher-1"), { kind: "not-found" });
});

test("fabricated video labels/dimensions cannot smuggle AAC into a video master or menu", () => {
  const corrupted = { ...observed()[1], kind: "video", isAudioOnly: false, name: "1080p",
    resolution: "1920x1080", frameRate: 30, codec: "mp4a.40.2,mp4a.40.2" };
  const qualities = [observed()[0], corrupted];
  const output = generateMasterPlaylist(source, qualities);
  assert.equal(output.match(/#EXT-X-STREAM-INF:/g).length, 1);
  assert.ok(!output.includes("mp4a.40.2,mp4a.40.2"));
  assert.equal(videoVariants(qualities).length, 1);
  const parsed = parseUsherMaster(master.replace('CODECS="mp4a.40.2"',
    'CODECS="mp4a.40.2,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=30'), "https://usher.ttvnw.net/test.m3u8");
  assert.equal(parsed[1].kind, "audio");
  assert.equal(parsed[1].codec, "mp4a.40.2");
  assert.equal(parsed[1].resolution, undefined);
  assert.equal(parsed[1].frameRate, undefined);
});

test("missing video codec or resolution is rejected and diagnosed; duplicate codecs are normalized", () => {
  const warnings = [];
  mock.method(console, "warn", (...args) => warnings.push(args));
  const video = observed()[0];
  const output = generateMasterPlaylist(source, [
    { ...video, key: "no-codec", codec: undefined },
    { ...video, key: "no-size", resolution: undefined },
    { ...video, key: "duplicates", codec: "avc1.64002A,mp4a.40.2,mp4a.40.2" },
  ]);
  assert.equal(output.match(/#EXT-X-STREAM-INF:/g).length, 1);
  assert.ok(output.includes('CODECS="avc1.64002A,mp4a.40.2"'));
  assert.deepEqual(warnings.map(([, detail]) => detail.key), ["no-codec", "no-size"]);
});

test("unobserved keyless video falls back to one media playlist without audio or guessed attributes", async () => {
  const unknown = observed().map(variant => ({ ...variant, codec: undefined, resolution: undefined, frameRate: undefined, metadata: "unknown" }));
  mock.method(console, "warn", () => {});
  mock.method(globalThis, "fetch", async () => new Response(media));
  const redirect = await playbackPlaylist(source, unknown, "video");
  assert.deepEqual(redirect, { kind: "media-redirect", quality: "usher-0" });
  const selected = await playbackPlaylist(source, unknown, "video", redirect.quality);
  assert.ok(selected.text.includes("chunked"));
  assert.ok(!/STREAM-INF|CODECS|RESOLUTION|audio_only/.test(selected.text));
  // A pinned growing media path stays media when attributes become available.
  const refreshed = await playbackPlaylist(source, observed(), "video", redirect.quality);
  assert.ok(!refreshed.text.includes("STREAM-INF"));
  await assert.rejects(playbackPlaylist(source, [unknown[1]], "video"), { kind: "unavailable" });
});

test("observed attributes match rendition identity, never array order or sibling paths", () => {
  const values = observed();
  const keyless = values.map(variant => ({ ...variant, codec: undefined, bandwidth: undefined, metadata: "unknown" }));
  const merged = mergeCdnAttributes(keyless, [...values].reverse());
  assert.equal(merged[0].codec, "avc1.64002A,mp4a.40.2");
  assert.equal(merged[1].codec, "mp4a.40.2");
  const wrong = { ...values[0], playlistUrl: values[0].playlistUrl.replace("miraieta-", "other-") };
  assert.equal(mergeCdnAttributes([keyless[0]], [wrong])[0].codec, undefined);
  const mislabeled = { ...keyless[1], kind: "video", isAudioOnly: false };
  assert.equal(mergeCdnAttributes([mislabeled], values)[0].isAudioOnly, true);
});

test("keyless source labels expose decoded 1080p without inventing ABR attributes or audio dimensions", () => {
  const source = { key: "chunked", name: "Source", kind: "video", isAudioOnly: false, delivery: "hls", metadata: "unknown", playlistUrl: "https://fixture.cloudfront.net/archive/chunked/index-dvr.m3u8" };
  assert.equal(videoQualityLabel(source), "Source");
  assert.equal(videoQualityLabel(source, "1920x1080"), "1080p (Source)");
  assert.equal(videoQualityLabel(source, "2560x1440"), "1440p (Source)");
  assert.equal(videoQualityLabel({ ...source, resolution: "1920x1080", frameRate: 60 }, "1280x720"), "1080p60 (Source)");
  assert.equal(videoQualityLabel({ ...source, key: "720p60", name: "720p60" }, "1280x720"), "720p60");
  assert.equal(videoQualityLabel({ ...source, kind: "audio", isAudioOnly: true, name: "Audio Only" }, "1920x1080"), "Audio Only");
  const labeled = { ...source, name: videoQualityLabel(source, "1920x1080") };
  assert.equal(labeled.resolution, undefined);
  assert.equal(labeled.codec, undefined);
  mock.method(console, "warn", () => {});
  assert.ok(!generateMasterPlaylist({ vodId: "2895227665" }, [labeled]).includes("STREAM-INF"));
});
