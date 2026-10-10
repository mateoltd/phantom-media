import assert from "node:assert/strict";
import { test } from "node:test";
import { CONNECTION_ERROR_DETAILS, createConnectionHealth } from "../lib/media/connection-health.ts";

const playing = { active: true, starved: false, progressing: true, online: true };

test("advertised quality and a low encoded bitrate are not evidence of a bad connection", () => {
  const health = createConnectionHealth();
  for (let now = 0; now <= 30_000; now += 2_000) {
    health.fragmentLoaded(now, 200, 2);
    health.playback(now, playing);
  }
  assert.equal(health.unstable, false);
});

test("one slow segment is tolerated; repeated delivery slower than playback warns", () => {
  const health = createConnectionHealth();
  health.fragmentLoaded(0, 2_400, 2);
  assert.equal(health.unstable, false);
  health.fragmentLoaded(3_000, 2_100, 2);
  assert.equal(health.unstable, true);
});

test("fast delivery between slow segments and widely separated failures do not warn", () => {
  const health = createConnectionHealth();
  health.fragmentLoaded(0, 3_000, 2);
  health.fragmentLoaded(2_000, 100, 2);
  health.fragmentLoaded(4_000, 3_000, 2);
  health.networkError(0);
  health.networkError(20_000);
  assert.equal(health.unstable, false);
});

test("repeated recoverable network failures and a single fatal failure warn", () => {
  const health = createConnectionHealth();
  health.networkError(0);
  assert.equal(health.unstable, false);
  health.networkError(3_000);
  assert.equal(health.unstable, true);
  const fatal = createConnectionHealth();
  fatal.networkError(0, true);
  assert.equal(fatal.unstable, true);
  assert.equal(CONNECTION_ERROR_DETAILS.has("fragLoadTimeOut"), true);
  for (const detail of ["fragParsingError", "bufferStalledError", "subtitleTrackLoadError", "aborted"]) {
    assert.equal(CONNECTION_ERROR_DETAILS.has(detail), false);
  }
});

test("sustained buffer starvation warns; startup, pause and deliberate seeks do not", () => {
  const health = createConnectionHealth();
  const starved = { ...playing, starved: true, progressing: false };
  health.playback(0, { ...starved, active: false });
  health.playback(10_000, { ...starved, active: false });
  assert.equal(health.unstable, false);
  health.playback(11_000, starved);
  health.playback(13_000, starved);
  assert.equal(health.unstable, false);
  health.resetPlayback();
  health.playback(14_000, starved);
  health.playback(17_000, starved);
  assert.equal(health.unstable, true);
});

test("warning clears only after sustained advancing playback, not downloads or pause", () => {
  const health = createConnectionHealth();
  health.networkError(0, true);
  health.fragmentLoaded(1_000, 100, 2);
  health.playback(1_000, { ...playing, active: false });
  health.playback(30_000, { ...playing, active: false });
  assert.equal(health.unstable, true);
  health.playback(31_000, playing);
  health.playback(45_000, playing);
  assert.equal(health.unstable, true);
  health.playback(46_000, playing);
  assert.equal(health.unstable, false);
});

test("new failures during recovery and going offline keep the warning visible", () => {
  const health = createConnectionHealth();
  health.playback(0, { ...playing, online: false });
  assert.equal(health.unstable, true);
  health.playback(1_000, playing);
  health.networkError(14_000);
  health.playback(15_000, playing);
  health.playback(16_000, playing);
  assert.equal(health.unstable, true);
  health.playback(30_000, playing);
  assert.equal(health.unstable, false);
});

test("invalid samples and init-segment durations cannot trigger a warning", () => {
  const health = createConnectionHealth();
  for (const [ms, seconds] of [[Infinity, 2], [3_000, NaN], [3_000, 0], [-1, 2]]) {
    health.fragmentLoaded(0, ms, seconds);
    health.fragmentLoaded(1_000, ms, seconds);
  }
  assert.equal(health.unstable, false);
});
