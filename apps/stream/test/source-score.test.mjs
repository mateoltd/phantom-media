import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLORE_WEIGHT_FLOOR,
  HALF_LIFE_GLOBAL_MS,
  HALF_LIFE_TITLE_MS,
  PRIOR_VALUE,
  TITLE_WEIGHT_CAP,
  WEIGHT_CAP,
  blendedScore,
  coarseRegion,
  decayFactor,
  effectiveWeight,
  mergeRecords,
  posterior,
  relocate,
  reward,
  shouldRecord,
  titleKeyFor,
  update,
} from "../src/source-score.mjs";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1_000;

function observation(overrides = {}) {
  return {
    outcome: "verified",
    resolveMs: 1_000,
    probeMs: 200,
    tier: 4,
    attached: false,
    ttffMs: null,
    stalled: false,
    ...overrides,
  };
}

test("a fast, verified 1080p source scores near the top", () => {
  const r = reward(observation({ resolveMs: 1_000, probeMs: 200 }));
  // 0.5 + 0.3 * 1 + 0.2 * (1 - 1200/8000)
  assert.equal(Math.round(r * 100) / 100, 0.97);
});

test("an adaptive master that took six seconds is still respectable", () => {
  const r = reward(observation({ tier: 3, resolveMs: 5_800, probeMs: 200 }));
  // 0.5 + 0.3 * 0.75 + 0.2 * 0.25
  assert.equal(Math.round(r * 100) / 100, 0.78);
});

test("anything that did not produce a verified stream is worth nothing", () => {
  for (const outcome of ["empty", "unreachable", "limited"]) {
    assert.equal(reward(observation({ outcome })), 0);
  }
});

test("a source that dies mid-play lands below an ordinary working one", () => {
  const clean = reward(observation());
  const stalled = reward(observation({ stalled: true }));
  assert.ok(stalled < 0.5, `expected a stalled source under 0.5, got ${stalled}`);
  assert.equal(Math.round((clean - stalled) * 100) / 100, 0.5);
});

test("the stall penalty cannot push a reward below zero", () => {
  assert.equal(reward(observation({ outcome: "empty", stalled: true })), 0);
});

test("time to first frame replaces the probe once a source has attached", () => {
  const probed = reward(observation({ resolveMs: 1_000, probeMs: 3_000 }));
  const attached = reward(
    observation({ resolveMs: 1_000, probeMs: 3_000, attached: true, ttffMs: 400 }),
  );
  assert.ok(attached > probed);
});

test("a rate limit is never blamed on the source that was in flight", () => {
  assert.equal(shouldRecord({ outcome: "limited" }), false);
  for (const outcome of ["verified", "empty", "unreachable"]) {
    assert.equal(shouldRecord({ outcome }), true);
  }
});

test("one half-life halves the weight and leaves the value alone", () => {
  const record = { v: 0.8, w: 4, t: NOW };
  const later = NOW + HALF_LIFE_GLOBAL_MS;
  assert.equal(decayFactor(record, later, HALF_LIFE_GLOBAL_MS), 0.5);
  assert.equal(effectiveWeight(record, later, HALF_LIFE_GLOBAL_MS), 2);
  assert.equal(record.v, 0.8);
});

test("weight never grows past the cap however long a source keeps winning", () => {
  let record = null;
  for (let index = 0; index < 200; index += 1) {
    record = update(record, 1, NOW + index * 1_000, HALF_LIFE_GLOBAL_MS);
  }
  assert.ok(record.w <= WEIGHT_CAP, `weight ran to ${record.w}`);
  assert.equal(Math.round(record.v * 100) / 100, 1);
});

test("a run of failures drags a long-standing favourite back down", () => {
  let record = null;
  for (let index = 0; index < 40; index += 1) {
    record = update(record, 1, NOW + index * 1_000, HALF_LIFE_GLOBAL_MS);
  }
  for (let index = 0; index < 15; index += 1) {
    record = update(record, 0, NOW + (40 + index) * 1_000, HALF_LIFE_GLOBAL_MS);
  }
  assert.ok(record.v < 0.5, `expected the favourite dethroned, got ${record.v}`);
});

test("a source nobody has tried is worth exactly the prior", () => {
  assert.equal(posterior(null, NOW, HALF_LIFE_GLOBAL_MS), PRIOR_VALUE);
});

test("one empty result puts a newcomer below an established mediocre source", () => {
  const newcomer = update(null, 0, NOW, HALF_LIFE_GLOBAL_MS);
  const established = { v: 0.6, w: 8, t: NOW };
  assert.ok(
    posterior(newcomer, NOW, HALF_LIFE_GLOBAL_MS) <
      posterior(established, NOW, HALF_LIFE_GLOBAL_MS),
  );
});

test("an untried source still outranks one that has proven itself bad", () => {
  const bad = { v: 0.05, w: 6, t: NOW };
  assert.ok(
    posterior(null, NOW, HALF_LIFE_GLOBAL_MS) >
      posterior(bad, NOW, HALF_LIFE_GLOBAL_MS),
  );
});

test("with nothing known about the title, the score is exactly the global one", () => {
  const global = { v: 0.72, w: 5, t: NOW };
  assert.equal(
    blendedScore(global, null, NOW),
    posterior(global, NOW, HALF_LIFE_GLOBAL_MS),
  );
});

test("evidence about this title outvotes the global record once it piles up", () => {
  const global = { v: 0.2, w: 10, t: NOW };
  const forThisTitle = { v: 1, w: 6, t: NOW };
  const blended = blendedScore(global, forThisTitle, NOW);
  const globalOnly = posterior(global, NOW, HALF_LIFE_GLOBAL_MS);
  assert.ok(
    blended > globalOnly + 0.3,
    `expected the title record to dominate, got ${blended} against ${globalOnly}`,
  );
});

test("two observations about a title are worth about half the decision", () => {
  const global = { v: 0, w: 20, t: NOW };
  const forThisTitle = { v: 1, w: 2, t: NOW };
  const blended = blendedScore(global, forThisTitle, NOW);
  const globalOnly = posterior(global, NOW, HALF_LIFE_GLOBAL_MS);
  assert.ok(Math.abs(blended - (globalOnly + 1) / 2) < 0.01);
});

test("a heavily rewatched title cannot make a source immovable", () => {
  const global = { v: 0.5, w: 5, t: NOW };
  const capped = { v: 1, w: TITLE_WEIGHT_CAP, t: NOW };
  const beyond = { v: 1, w: TITLE_WEIGHT_CAP * 4, t: NOW };
  assert.equal(blendedScore(global, capped, NOW), blendedScore(global, beyond, NOW));
});

test("title evidence outlives global evidence", () => {
  const record = { v: 1, w: 4, t: NOW };
  const later = NOW + 14 * DAY;
  assert.ok(
    effectiveWeight(record, later, HALF_LIFE_TITLE_MS) >
      effectiveWeight(record, later, HALF_LIFE_GLOBAL_MS),
  );
});

test("a title key is per season, not per episode", () => {
  assert.equal(titleKeyFor("tv", "tt0898266", 3), "tv:tt0898266:3");
  assert.equal(titleKeyFor("movie", "tt0111161", 1), "movie:tt0111161");
});

test("merging two records is commutative and adds their weight", () => {
  const left = { v: 1, w: 3, t: NOW };
  const right = { v: 0, w: 1, t: NOW + 1_000 };
  const merged = mergeRecords(left, right);
  assert.deepEqual(merged, mergeRecords(right, left));
  assert.equal(merged.v, 0.75);
  assert.equal(merged.w, 4);
  assert.equal(merged.t, NOW + 1_000);
});

test("merging respects the weight cap and tolerates a missing side", () => {
  const heavy = { v: 1, w: WEIGHT_CAP, t: NOW };
  assert.equal(mergeRecords(heavy, heavy).w, WEIGHT_CAP);
  assert.deepEqual(mergeRecords(null, heavy), heavy);
  assert.deepEqual(mergeRecords(heavy, null), heavy);
  assert.equal(mergeRecords(null, null), null);
});

test("region is the continent, so a VPN hopping cities changes nothing", () => {
  assert.equal(coarseRegion("America/Bogota"), "America");
  assert.equal(coarseRegion("America/New_York"), "America");
  assert.equal(coarseRegion("Europe/Madrid"), "Europe");
  assert.equal(coarseRegion(""), "unknown");
  assert.equal(coarseRegion(undefined), "unknown");
});

test("moving continents halves confidence without discarding what was learned", () => {
  const before = { a: { v: 0.9, w: 8, t: NOW }, b: { v: 0.1, w: 3, t: NOW } };
  const after = relocate(before);
  assert.equal(after.a.v, 0.9);
  assert.equal(after.b.v, 0.1);
  assert.equal(after.a.w, 4);
  assert.equal(after.b.w, 1.5);
  // Halving drops it back under the floor, so exploration resumes.
  assert.ok(after.b.w < EXPLORE_WEIGHT_FLOOR);
});
