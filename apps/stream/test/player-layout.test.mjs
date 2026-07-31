import assert from "node:assert/strict";
import test from "node:test";
import { stageAspectRatio } from "../src/player-layout.mjs";

test("video metadata produces a valid CSS aspect-ratio value", () => {
  assert.equal(stageAspectRatio(1920, 1080), "1920 / 1080");
  assert.equal(stageAspectRatio(3840, 1608), "3840 / 1608");
});

test("invalid video dimensions leave the stage fallback intact", () => {
  assert.equal(stageAspectRatio(0, 1080), null);
  assert.equal(stageAspectRatio(1920, 0), null);
  assert.equal(stageAspectRatio(Number.NaN, 1080), null);
});
