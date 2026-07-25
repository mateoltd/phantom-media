import assert from "node:assert/strict";
import test from "node:test";
import { ServerPool } from "../src/server-pool.mjs";

test("moves a failing provider behind healthy providers", () => {
  const pool = new ServerPool(["orion_", "berkas_", "athena_"]);
  pool.recordSuccess("orion_", 400);
  pool.recordSuccess("berkas_", 150);
  pool.recordFailure("orion_", Object.assign(new Error("bad gateway"), { status: 502 }), 1_000);

  assert.deepEqual(pool.available(["orion_", "berkas_", "athena_"], 1_001), [
    "berkas_",
    "athena_",
  ]);
});

test("respects retry-after for rate-limited providers", () => {
  const pool = new ServerPool(["orion_", "berkas_"]);
  pool.recordFailure(
    "orion_",
    Object.assign(new Error("rate limited"), {
      status: 429,
      retryAfterMs: 12_000,
    }),
    5_000,
  );

  assert.deepEqual(pool.available(undefined, 16_999), ["berkas_"]);
  assert.deepEqual(pool.available(undefined, 17_001), ["berkas_", "orion_"]);
  assert.equal(pool.cooldownRemaining("orion_", 16_000), 1_000);
});
