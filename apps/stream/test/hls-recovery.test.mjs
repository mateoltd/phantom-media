import assert from "node:assert/strict";
import test from "node:test";
import {
  HLS_FRAGMENT_LOAD_POLICY,
  hlsStallRecoveryAction,
} from "../src/hls-recovery.mjs";

const playback = {
  paused: false,
  seeking: false,
  ended: false,
  playbackRate: 1,
  currentTime: 600,
  readyState: 2,
  bufferAheadSeconds: 0,
};

test("fragment loading uses the current bounded hls.js policy", () => {
  assert.equal(HLS_FRAGMENT_LOAD_POLICY.maxTimeToFirstByteMs, 8_000);
  assert.equal(HLS_FRAGMENT_LOAD_POLICY.maxLoadTimeMs, 25_000);
  assert.equal(HLS_FRAGMENT_LOAD_POLICY.timeoutRetry.maxNumRetry, 2);
});

test("a persistent buffer-starved playback restarts its loader", () => {
  assert.equal(hlsStallRecoveryAction(playback), "restart");
});

test("a decoder stall with buffered video gets a tiny playhead nudge", () => {
  assert.equal(
    hlsStallRecoveryAction({
      ...playback,
      readyState: 3,
      bufferAheadSeconds: 8,
    }),
    "nudge",
  );
});

test("deliberate pause, seek and healthy playback are left alone", () => {
  assert.equal(hlsStallRecoveryAction({ ...playback, paused: true }), "none");
  assert.equal(hlsStallRecoveryAction({ ...playback, seeking: true }), "none");
  assert.equal(
    hlsStallRecoveryAction({
      ...playback,
      readyState: 4,
      bufferAheadSeconds: 0.3,
    }),
    "none",
  );
});
