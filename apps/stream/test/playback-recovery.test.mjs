import assert from "node:assert/strict";
import test from "node:test";
import { PlaybackRecoveryState } from "../src/playback-recovery.mjs";

test("rapid automatic recovery is bounded and never retries failed sources", () => {
  const recovery = new PlaybackRecoveryState(2);
  assert.equal(recovery.recordFailure("a"), true);
  assert.deepEqual(recovery.eligible(["a", "b", "c"]), ["b", "c"]);
  assert.equal(recovery.recordFailure("b"), true);
  assert.deepEqual(recovery.eligible(["a", "b", "c"]), ["c"]);
  assert.equal(recovery.recordFailure("c"), false);
  assert.equal(recovery.attempts, 2);
});

test("a deliberate reset starts a fresh recovery session", () => {
  const recovery = new PlaybackRecoveryState(1);
  assert.equal(recovery.recordFailure("a"), true);
  assert.equal(recovery.recordFailure("b"), false);
  recovery.reset();
  assert.deepEqual(recovery.eligible(["a", "b"]), ["a", "b"]);
  assert.equal(recovery.recordFailure("b"), true);
});
