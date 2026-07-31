import assert from "node:assert/strict";
import test from "node:test";
import {
  dashMaxVideoHeight,
  hlsMaxVideoHeight,
  manifestVideoHeight,
} from "../src/media-quality.mjs";

test("reads the highest HLS rendition instead of trusting an adaptive label", () => {
  const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080.m3u8`;
  assert.equal(hlsMaxVideoHeight(manifest), 1080);
  assert.equal(manifestVideoHeight("hls", manifest), 1080);
});

test("reads the highest DASH representation height", () => {
  const manifest = `<MPD><Period><AdaptationSet contentType="video">
    <Representation width="1280" height="720" />
    <Representation width="3840" height="2160" />
  </AdaptationSet></Period></MPD>`;
  assert.equal(dashMaxVideoHeight(manifest), 2160);
  assert.equal(manifestVideoHeight("dash", manifest), 2160);
});

test("a manifest with no quality evidence stays unknown", () => {
  assert.equal(hlsMaxVideoHeight("#EXTM3U\n#EXTINF:10,\nsegment.ts"), 0);
  assert.equal(dashMaxVideoHeight("<MPD><Period /></MPD>"), 0);
});
