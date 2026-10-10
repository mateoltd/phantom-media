import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveFolder, archiveHosts, archiveStartCandidates } from "../lib/playback/archive.ts";

test("archive folders match the names Twitch gives recordings", () => {
  assert.equal(archiveFolder("zackrawrr", "317518201335", 1790270830), "0a08539290023a42e6db_zackrawrr_317518201335_1790270830");
  assert.equal(archiveFolder("paulaguti26", "317847587299", 1790281641), "d1972bea7162904fedc1_paulaguti26_317847587299_1790281641");
});

test("archive hosts come from past broadcast thumbnails and skip placeholders", () => {
  assert.deepEqual(archiveHosts([
    { previewThumbnailURL: "https://vod-secure.twitch.tv/_404/404_processing_640x360.png" },
    { previewThumbnailURL: "https://static-cdn.jtvnw.net/cf_vods/d3stzm2eumvgb4/88a56f2fa9eed517d3f9_paulaguti26_317842012003_1790243346//thumb/thumb0-640x360.jpg" },
    { previewThumbnailURL: "https://static-cdn.jtvnw.net/cf_vods/d3stzm2eumvgb4/7bfac2a6daa760a71354_paulaguti26_317825593059_1790072563//thumb/thumb0-640x360.jpg" },
    {},
  ]), ["d3stzm2eumvgb4.cloudfront.net"]);
});

test("start candidates try the reported start first, then widen", () => {
  assert.deepEqual(archiveStartCandidates("2026-09-24T20:27:21Z", 2), [1790281641, 1790281640, 1790281642, 1790281639, 1790281643]);
  assert.deepEqual(archiveStartCandidates("not a date"), []);
});
