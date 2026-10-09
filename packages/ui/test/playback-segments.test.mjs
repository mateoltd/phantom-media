import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePlaybackSegments, playbackSegmentLabelsAt, projectPlaybackSegment, segmentAppearance,
} from "../src/playback-segments.ts";

const segment = (id, start, end, kind = "topic", label = id) => ({ id, start, end, kind, label });

test("normalization preserves overlapping kinds and stable identity without mutating metadata", () => {
  const input = [segment("muted", 20, 40, "muted"), segment("topic", 0, 60)];
  const result = normalizePlaybackSegments(input);
  assert.deepEqual(result.map(({ id }) => id), ["topic", "muted"]);
  assert.equal(result[1], input[0]);
  assert.equal(input[0].id, "muted");
});

test("invalid intervals and duplicate IDs cannot create misleading markers", () => {
  const valid = segment("valid", 0, 10);
  const result = normalizePlaybackSegments([
    valid, segment("valid", 50, 60), segment("negative", -1, 10), segment("empty", 2, 2),
    segment("reversed", 4, 2), segment("nan", NaN, 10), segment("infinite", 0, Infinity),
    segment("", 0, 5), segment("no-kind", 0, 5, ""), segment("no-label", 0, 5, "topic", ""),
  ]);
  assert.deepEqual(result, [valid]);
});

test("adjacent chapters use exclusive ends and overlapping annotations keep all labels", () => {
  const segments = normalizePlaybackSegments([
    segment("first", 0, 30, "topic", "Introduction"), segment("second", 30, 90, "topic", "Discussion"),
    segment("mute-a", 20, 40, "muted", "Muted audio"), segment("mute-b", 25, 35, "muted", "Muted audio"),
  ]);
  assert.deepEqual(playbackSegmentLabelsAt(segments, 25), ["Introduction", "Muted audio"]);
  assert.deepEqual(playbackSegmentLabelsAt(segments, 30), ["Muted audio", "Discussion"]);
  assert.deepEqual(playbackSegmentLabelsAt(segments, 90), []);
});

test("VOD projection clips intervals to the known duration", () => {
  assert.deepEqual(projectPlaybackSegment(segment("end", 80, 120), 0, 100), {
    left: 0.8, width: 0.2, startsInViewport: true,
  });
  assert.equal(projectPlaybackSegment(segment("after", 100, 120), 0, 100), null);
});

test("sliding DVR projection retains absolute identity without inventing chapter boundaries", () => {
  const topic = segment("topic", 80, 160);
  assert.deepEqual(projectPlaybackSegment(topic, 100, 100), {
    left: 0, width: 0.6, startsInViewport: false,
  });
  assert.deepEqual(projectPlaybackSegment(topic, 150, 100), {
    left: 0, width: 0.1, startsInViewport: false,
  });
  assert.equal(projectPlaybackSegment(topic, 160, 100), null);
  assert.equal(topic.start, 80);
});

test("unknown duration and nonfinite viewports hide markers until usable metadata arrives", () => {
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.equal(projectPlaybackSegment(segment("topic", 0, 10), 0, duration), null);
  }
  assert.equal(projectPlaybackSegment(segment("topic", 0, 10), NaN, 100), null);
});

test("new segment kinds and custom appearances do not require a change to the player", () => {
  const custom = { marker: "range", color: "purple", layer: 2 };
  assert.equal(segmentAppearance("sponsor", { sponsor: custom }), custom);
  assert.equal(segmentAppearance("muted").marker, "range");
  assert.equal(segmentAppearance("topic").marker, "boundary");
  assert.equal(segmentAppearance("new-kind").marker, "range");
});
