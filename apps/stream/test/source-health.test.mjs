import assert from "node:assert/strict";
import test from "node:test";
import {
  COOLDOWN_DOMAIN_HEADER,
  COOLDOWN_MS_HEADER,
  applyCooldownHeaders,
  clearAllCooldowns,
  clearSingleflight,
  coolingMapFor,
  cooldownResponseHeaders,
  isCooling,
  readCooldown,
  recordCooldown,
  resolveKeyFor,
  singleflight,
} from "../src/source-health.mjs";
import { orderSources } from "../src/router-policy.mjs";

function snapshotOf(table = {}) {
  const at = (id) => table[id] ?? {};
  return {
    score: (id) => at(id).score ?? 0.55,
    weight: (id) => at(id).weight ?? 0,
    titleWeight: (id) => at(id).titleWeight ?? 0,
  };
}

test("cooldowns are keyed by failure domain and honour retry-after", () => {
  clearAllCooldowns();
  const at = 1_000_000;
  const until = recordCooldown("fd-12345678", 5_000, { now: at });
  assert.equal(until, at + 5_000);
  assert.equal(isCooling("fd-12345678", { now: at + 1_000 }), true);
  assert.equal(isCooling("fd-12345678", { now: at + 6_000 }), false);
  assert.equal(readCooldown("fd-12345678", { now: at + 6_000 }), 0);
});

test("cooldowns clamp to the cap and fall back when no hint exists", () => {
  clearAllCooldowns();
  const capped = recordCooldown("fd-cap", 600_000, { now: 0 });
  assert.equal(capped, 60_000);
  const fallback = recordCooldown("fd-fallback", null, { now: 0 });
  assert.equal(fallback, 60_000);
});

test("cooling map feeds orderSources so a cooling domain is skipped", () => {
  clearAllCooldowns();
  const base = 2_000_000_000_000;
  recordCooldown("fd-down", 30_000, { now: base });
  const explicit = coolingMapFor(
    ["down", "fine"],
    (id) => (id === "down" ? "fd-down" : "fd-fine"),
    { now: base + 1_000 },
  );
  assert.ok(explicit.down > base + 1_000);
  assert.equal(explicit.fine, 0);
  const order = orderSources(["down", "fine"], snapshotOf(), {
    now: base + 1_000,
    cooling: explicit,
  });
  assert.deepEqual(order, ["fine"]);
});

test("singleflight coalesces concurrent resolves for one key", async () => {
  clearSingleflight();
  let calls = 0;
  const task = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return { ok: true };
  };
  const key = resolveKeyFor({
    sourceId: "u9",
    type: "movie",
    tmdbId: 550,
    season: 0,
    episode: 0,
    audioLanguage: "en",
    fresh: false,
  });
  const [a, b] = await Promise.all([singleflight(key, task), singleflight(key, task)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { ok: true });
  assert.deepEqual(b, { ok: true });
  // After settle the next call re-resolves.
  await singleflight(key, task);
  assert.equal(calls, 2);
});

test("resolve keys separate language, episode, and freshness", () => {
  const base = { sourceId: "u9", type: "tv", tmdbId: 1, season: 1, episode: 2, audioLanguage: "en", fresh: false };
  assert.notEqual(resolveKeyFor(base), resolveKeyFor({ ...base, audioLanguage: "es" }));
  assert.notEqual(resolveKeyFor(base), resolveKeyFor({ ...base, episode: 3 }));
  assert.notEqual(resolveKeyFor(base), resolveKeyFor({ ...base, fresh: true }));
});

test("cooldown headers propagate without new infra", () => {
  clearAllCooldowns();
  const headers = cooldownResponseHeaders("fd-abc", 12_000);
  assert.equal(headers[COOLDOWN_DOMAIN_HEADER], "fd-abc");
  assert.equal(headers[COOLDOWN_MS_HEADER], "12000");
  const applied = applyCooldownHeaders(new Headers(headers), { now: 0 });
  assert.equal(applied, 12_000);
  assert.equal(isCooling("fd-abc", { now: 1_000 }), true);
});
