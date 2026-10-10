import assert from "node:assert/strict";
import { test } from "node:test";
import { getVodPlaybackSegments } from "../lib/playback/segments.ts";

test("Twitch metadata becomes provider-independent playback segments in one pass", () => {
  const video = { muteInfo: { mutedSegmentConnection: { nodes: [
    { offset: 16605, duration: 203 }, { offset: 200, duration: 60 },
  ] } } };
  assert.deepEqual(getVodPlaybackSegments(video), [
    { id: "muted:200:60", kind: "muted", start: 200, end: 260, label: "Muted audio" },
    { id: "muted:16605:203", kind: "muted", start: 16605, end: 16808, label: "Muted audio" },
  ]);
});

test("missing optional Twitch metadata means no segments", () => {
  for (const video of [{}, { muteInfo: null }, { muteInfo: { mutedSegmentConnection: { nodes: null } } }]) {
    assert.deepEqual(getVodPlaybackSegments(video), []);
  }
});

test("bad Twitch intervals and repeated nodes do not leak into the slider", () => {
  const nodes = [
    { offset: 20, duration: 10 }, { offset: 20, duration: 10 },
    { offset: -1, duration: 10 }, { offset: 40, duration: 0 },
    { offset: 50, duration: -5 }, { offset: Infinity, duration: 2 },
    { offset: 1, duration: NaN }, { offset: Number.MAX_VALUE, duration: Number.MAX_VALUE },
  ];
  assert.equal(getVodPlaybackSegments({ muteInfo: { mutedSegmentConnection: { nodes } } }).length, 1);
});
