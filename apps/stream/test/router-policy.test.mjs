import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIDENT_FAIL_WEIGHT,
  GRACE_MS,
  HARD_MS,
  MAX_WAVE,
  MIN_WAVE,
  RATE_LIMIT_COOLDOWN_MS,
  bestVerifiedTier,
  describeSource,
  graceDeadline,
  initialRaceState,
  isExcellent,
  isGoodEnough,
  nextWaveSize,
  offerScore,
  orderSources,
  raceStep,
} from "../src/router-policy.mjs";

const NOW = 1_700_000_000_000;

function snapshotOf(table = {}) {
  const at = (id) => table[id] ?? {};
  return {
    now: NOW,
    score: (id) => at(id).score ?? 0.55,
    weight: (id) => at(id).weight ?? 0,
    titleWeight: (id) => at(id).titleWeight ?? 0,
  };
}

function offerOf(overrides = {}) {
  return {
    sourceId: "a",
    label: "Source 01",
    verified: true,
    verifiedTier: 4,
    totalMs: 1_000,
    ranked: [],
    attempts: [{ id: "c1" }],
    subtitles: [],
    resolveMs: 800,
    probeMs: 200,
    ...overrides,
  };
}

test("a proven source is asked before an unproven one", () => {
  const snapshot = snapshotOf({
    good: { score: 0.9, weight: 10 },
    unknown: { score: 0.55, weight: 0 },
  });
  const order = orderSources(["unknown", "good"], snapshot, { now: NOW });
  assert.equal(order[0], "good");
});

test("a source nobody has measured still makes the first wave", () => {
  const table = {};
  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
    table[id] = { score: 0.9, weight: 10 };
  }
  table.newcomer = { score: 0.3, weight: 0 };
  const order = orderSources(
    ["a", "b", "c", "d", "e", "f", "g", "newcomer"],
    snapshotOf(table),
    { now: NOW },
  );
  assert.ok(
    order.indexOf("newcomer") < MAX_WAVE,
    `expected the newcomer inside the first wave, got ${order.join(", ")}`,
  );
});

test("the exploration slot goes away once everything has been measured", () => {
  const table = {};
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    table[id] = { score: 0.9, weight: 10 };
  }
  table.weak = { score: 0.3, weight: 8 };
  const order = orderSources(
    ["a", "b", "c", "d", "e", "f", "weak"],
    snapshotOf(table),
    { now: NOW },
  );
  assert.equal(order[order.length - 1], "weak");
});

test("a source proven useless goes last but is never dropped", () => {
  const snapshot = snapshotOf({
    spent: { score: 0.01, weight: CONFIDENT_FAIL_WEIGHT },
    fine: { score: 0.7, weight: 6 },
  });
  const order = orderSources(["spent", "fine"], snapshot, { now: NOW });
  assert.deepEqual(order, ["fine", "spent"]);
});

test("a source cooling off is skipped by the automatic race", () => {
  const snapshot = snapshotOf({
    down: { score: 0.9, weight: 6 },
    fine: { score: 0.6, weight: 6 },
  });
  const order = orderSources(["down", "fine"], snapshot, {
    now: NOW,
    cooling: { down: NOW + 30_000 },
  });
  assert.deepEqual(order, ["fine"]);
});

test("an automatic race waits when its only source is cooling", () => {
  const order = orderSources(["only"], snapshotOf(), {
    now: NOW,
    cooling: { only: NOW + 30_000 },
  });
  assert.deepEqual(order, []);
});

test("pinning asks that source and nothing else", () => {
  const snapshot = snapshotOf({ best: { score: 0.99, weight: 20 } });
  assert.deepEqual(
    orderSources(["best", "chosen"], snapshot, { pinned: "chosen", now: NOW }),
    ["chosen"],
  );
});

test("pinning explicitly overrides an active source cooldown", () => {
  assert.deepEqual(
    orderSources(["chosen"], snapshotOf(), {
      pinned: "chosen",
      cooling: { chosen: NOW + 30_000 },
      now: NOW,
    }),
    ["chosen"],
  );
});

test("pinning a source that is not on the roster asks nothing", () => {
  assert.deepEqual(
    orderSources(["a", "b"], snapshotOf(), { pinned: "ghost", now: NOW }),
    [],
  );
});

test("equal evidence preserves the configured roster priority", () => {
  const snapshot = snapshotOf({
    a: { score: 0.5, weight: 9 },
    b: { score: 0.5, weight: 9 },
  });
  assert.deepEqual(orderSources(["b", "a"], snapshot, { now: NOW }), [
    "b",
    "a",
  ]);
});

test("equal evidence uses global language and playback hints before roster order", () => {
  assert.deepEqual(
    orderSources(["s7", "z2", "va", "n1"], snapshotOf(), {
      now: NOW,
      preferredAudioLanguage: "en",
    }),
    ["n1", "va", "s7", "z2"],
  );
});

test("a rate limit narrows the next wave, and it climbs back one at a time", () => {
  assert.equal(nextWaveSize(MAX_WAVE, true), MIN_WAVE);
  assert.equal(nextWaveSize(2, false), 3);
  assert.equal(nextWaveSize(3, false), 4);
  assert.equal(nextWaveSize(4, false), 5);
  assert.equal(nextWaveSize(5, false), MAX_WAVE);
});

test("a verified adaptive master is worth attaching on sight", () => {
  assert.equal(isExcellent(offerOf({ verifiedTier: 3 })), true);
});

test("an unverified 1080p claim is not, however high it rates itself", () => {
  assert.equal(isExcellent(offerOf({ verified: false, verifiedTier: 4 })), false);
});

test("unknown audio is held as fallback even when its video quality is excellent", () => {
  assert.equal(
    isExcellent(
      offerOf({
        verified: true,
        verifiedTier: 4,
        audioVerified: false,
        audioFallback: true,
      }),
    ),
    false,
  );
});

test("explicitly selected unverified audio can start immediately", () => {
  assert.equal(
    isExcellent(
      offerOf({
        verified: true,
        verifiedTier: 4,
        audioVerified: false,
        audioFallback: false,
      }),
    ),
    true,
  );
});

test("verified 720p is not excellent on its own", () => {
  assert.equal(isExcellent(offerOf({ verifiedTier: 2 })), false);
});

test("but verified 720p is enough from a source proven on this title", () => {
  const snapshot = snapshotOf({ a: { score: 0.85, weight: 8, titleWeight: 4 } });
  assert.equal(isGoodEnough(offerOf({ verifiedTier: 2 }), snapshot), true);
});

test("a good general record is not enough without evidence for this title", () => {
  const snapshot = snapshotOf({ a: { score: 0.85, weight: 8, titleWeight: 0 } });
  assert.equal(isGoodEnough(offerOf({ verifiedTier: 2 }), snapshot), false);
});

test("verified 1080p at 2.4s beats verified 480p at 0.4s", () => {
  const snapshot = snapshotOf();
  const better = offerOf({ sourceId: "slow", verifiedTier: 4, totalMs: 2_400 });
  const worse = offerOf({ sourceId: "fast", verifiedTier: 1, totalMs: 400 });
  assert.ok(
    offerScore(better, snapshot) > offerScore(worse, snapshot),
    "the reported bug: a fast low-quality source outranking a slower good one",
  );
});

test("between equal streams, the source with the better record wins", () => {
  const snapshot = snapshotOf({
    trusted: { score: 0.95, weight: 10 },
    unknown: { score: 0.4, weight: 2 },
  });
  assert.ok(
    offerScore(offerOf({ sourceId: "trusted" }), snapshot) >
      offerScore(offerOf({ sourceId: "unknown" }), snapshot),
  );
});

test("verified requested-language audio always outranks unverified fallback audio", () => {
  const snapshot = snapshotOf();
  const verified = offerOf({
    sourceId: "verified",
    verifiedTier: 1,
    audioVerified: true,
    totalMs: 5_000,
  });
  const fallback = offerOf({
    sourceId: "fallback",
    verifiedTier: 4,
    audioVerified: false,
    audioFallback: true,
    fallbackPreference: 1,
    totalMs: 100,
  });
  assert.ok(offerScore(verified, snapshot) > offerScore(fallback, snapshot));
});

test("observational language rank dominates video quality between fallbacks", () => {
  const snapshot = snapshotOf();
  const preferred = offerOf({
    sourceId: "clean-english",
    verifiedTier: 1,
    audioVerified: false,
    audioFallback: true,
    fallbackPreference: 0.8,
    totalMs: 5_000,
  });
  const worseLanguage = offerOf({
    sourceId: "foreign-burned-in",
    verifiedTier: 4,
    audioVerified: false,
    audioFallback: true,
    fallbackPreference: 0.4,
    totalMs: 100,
  });
  assert.ok(
    offerScore(preferred, snapshot) > offerScore(worseLanguage, snapshot),
  );
});

test("observed sustainable playback breaks a fallback language tie", () => {
  const snapshot = snapshotOf();
  const fast = offerOf({
    sourceId: "fast",
    audioFallback: true,
    fallbackPreference: 1,
    fallbackPlaybackPreference: 0.9,
    verifiedTier: 1,
    totalMs: 5_000,
  });
  const buffers = offerOf({
    sourceId: "buffers",
    audioFallback: true,
    fallbackPreference: 1,
    fallbackPlaybackPreference: 0.1,
    verifiedTier: 4,
    totalMs: 100,
  });
  assert.ok(offerScore(fast, snapshot) > offerScore(buffers, snapshot));
});

test("an offer arriving late in the race gets what is left of the window", () => {
  assert.equal(graceDeadline(NOW, NOW), NOW + GRACE_MS);
  const late = NOW + HARD_MS - 100;
  assert.equal(graceDeadline(late, NOW), NOW + HARD_MS);
  assert.equal(graceDeadline(late, NOW) - late, 100);
});

test("bestVerifiedTier defaults to nothing rather than guessing", () => {
  assert.equal(bestVerifiedTier({}), 0);
});

test("an excellent offer attaches at once, with no window armed", () => {
  const snapshot = snapshotOf();
  const state = initialRaceState(NOW);
  const step = raceStep(state, { type: "offer", offer: offerOf() }, NOW, snapshot);
  assert.equal(step.action.type, "attach");
  assert.equal(step.state.graceUntil, Number.POSITIVE_INFINITY);
  assert.equal(step.state.attaching, "a");
});

test("an ordinary offer is held and the window starts running", () => {
  const snapshot = snapshotOf();
  const state = initialRaceState(NOW);
  const step = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW,
    snapshot,
  );
  assert.equal(step.action.type, "continue");
  assert.equal(step.state.held.sourceId, "a");
  assert.equal(step.state.graceUntil, NOW + GRACE_MS);
});

test("unverified audio waits until the hard deadline for a language match", () => {
  const step = raceStep(
    initialRaceState(NOW),
    {
      type: "offer",
      offer: offerOf({
        audioVerified: false,
        audioFallback: true,
        verifiedTier: 4,
      }),
    },
    NOW,
    snapshotOf(),
  );
  assert.equal(step.action.type, "continue");
  assert.equal(step.state.graceUntil, NOW + HARD_MS);
});

test("a verified-language offer replaces fallback audio and shortens the wait", () => {
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    {
      type: "offer",
      offer: offerOf({
        sourceId: "fallback",
        audioVerified: false,
        audioFallback: true,
        verifiedTier: 4,
      }),
    },
    NOW,
    snapshotOf(),
  ));
  const step = raceStep(
    state,
    {
      type: "offer",
      offer: offerOf({
        sourceId: "verified",
        audioVerified: true,
        verifiedTier: 2,
      }),
    },
    NOW + 100,
    snapshotOf(),
  );
  assert.equal(step.state.held.sourceId, "verified");
  assert.ok(step.state.graceUntil < NOW + HARD_MS);
});

test("a better offer inside the window replaces the held one", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ sourceId: "poor", verifiedTier: 1 }) },
    NOW,
    snapshot,
  ));
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ sourceId: "better", verifiedTier: 2 }) },
    NOW + 300,
    snapshot,
  ));
  assert.equal(state.held.sourceId, "better");
  assert.equal(state.graceUntil, NOW + GRACE_MS);
});

test("a worse offer inside the window is discarded", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ sourceId: "good", verifiedTier: 2 }) },
    NOW,
    snapshot,
  ));
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ sourceId: "poor", verifiedTier: 1 }) },
    NOW + 300,
    snapshot,
  ));
  assert.equal(state.held.sourceId, "good");
});

test("when the window closes the held offer goes on screen", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW,
    snapshot,
  ));
  const step = raceStep(state, { type: "tick" }, NOW + GRACE_MS, snapshot);
  assert.equal(step.action.type, "attach");
  assert.equal(step.action.offer.sourceId, "a");
});

test("a tick before the window closes changes nothing", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW,
    snapshot,
  ));
  const step = raceStep(state, { type: "tick" }, NOW + 10, snapshot);
  assert.equal(step.action.type, "continue");
  assert.equal(step.state.held.sourceId, "a");
});

test("a tick with nothing held does nothing at all", () => {
  const step = raceStep(
    initialRaceState(NOW),
    { type: "tick" },
    NOW + 10_000,
    snapshotOf(),
  );
  assert.equal(step.action.type, "continue");
});

test("an offer arriving during an attach does not interrupt the picture", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(state, { type: "offer", offer: offerOf() }, NOW, snapshot));
  const step = raceStep(
    state,
    { type: "offer", offer: offerOf({ sourceId: "later" }) },
    NOW + 50,
    snapshot,
  );
  assert.equal(step.action.type, "continue");
  assert.equal(step.state.attaching, "a");
});

test("the last source answering with something playable is attached, not dropped", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW,
    snapshot,
  ));
  const step = raceStep(state, { type: "exhausted" }, NOW + 50, snapshot);
  assert.equal(
    step.action.type,
    "attach",
    "a held offer must survive the race running out",
  );
});

test("an offer arriving after the last source is attached without waiting", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(state, { type: "exhausted" }, NOW, snapshot));
  const step = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW + 10,
    snapshot,
  );
  assert.equal(step.action.type, "attach");
});

test("running out with nothing to show gives a cooldown, not a hang", () => {
  const step = raceStep(
    initialRaceState(NOW),
    { type: "exhausted" },
    NOW + 1_000,
    snapshotOf(),
  );
  assert.equal(step.action.type, "stop");
  assert.equal(step.action.reason, "exhausted");
  assert.ok(step.action.cooldownMs >= 10_000);
});

test("a rate limit stops the race and cools down for at least thirty seconds", () => {
  const step = raceStep(
    initialRaceState(NOW),
    { type: "failure", sourceId: "a", kind: "limited", retryAfterMs: null },
    NOW,
    snapshotOf(),
  );
  assert.equal(step.action.type, "stop");
  assert.equal(step.action.reason, "rateLimited");
  assert.equal(step.action.cooldownMs, RATE_LIMIT_COOLDOWN_MS);
});

test("a rate limit honours a longer retry-after when upstream sends one", () => {
  const step = raceStep(
    initialRaceState(NOW),
    { type: "failure", sourceId: "a", kind: "limited", retryAfterMs: 90_000 },
    NOW,
    snapshotOf(),
  );
  assert.equal(step.action.cooldownMs, 90_000);
});

test("a rate limit still plays anything already found", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(
    state,
    { type: "offer", offer: offerOf({ verifiedTier: 1 }) },
    NOW,
    snapshot,
  ));
  const step = raceStep(
    state,
    { type: "failure", sourceId: "b", kind: "limited", retryAfterMs: null },
    NOW + 20,
    snapshot,
  );
  assert.equal(step.action.type, "attach");
});

test("an ordinary failure just carries on", () => {
  const step = raceStep(
    initialRaceState(NOW),
    { type: "failure", sourceId: "a", kind: "unreachable", retryAfterMs: null },
    NOW,
    snapshotOf(),
  );
  assert.equal(step.action.type, "continue");
});

test("a failed attach resumes the race instead of ending it", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(state, { type: "offer", offer: offerOf() }, NOW, snapshot));
  const step = raceStep(
    state,
    { type: "attachFailed", sourceId: "a" },
    NOW + 5_000,
    snapshot,
  );
  assert.equal(step.action.type, "continue");
  assert.equal(step.state.attaching, null);
});

test("a failed attach falls back to whatever else was held", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(state, { type: "offer", offer: offerOf() }, NOW, snapshot));
  state = { ...state, held: offerOf({ sourceId: "spare", verifiedTier: 1 }) };
  const step = raceStep(
    state,
    { type: "attachFailed", sourceId: "a" },
    NOW + 5_000,
    snapshot,
  );
  assert.equal(step.action.type, "attach");
  assert.equal(step.action.offer.sourceId, "spare");
});

test("a failed attach on the last source ends the race", () => {
  const snapshot = snapshotOf();
  let state = initialRaceState(NOW);
  ({ state } = raceStep(state, { type: "offer", offer: offerOf() }, NOW, snapshot));
  ({ state } = raceStep(state, { type: "exhausted" }, NOW + 10, snapshot));
  const step = raceStep(
    state,
    { type: "attachFailed", sourceId: "a" },
    NOW + 5_000,
    snapshot,
  );
  assert.equal(step.action.type, "stop");
});

test("the source menu says what is known, and admits when nothing is", () => {
  assert.equal(describeSource(snapshotOf(), "fresh"), "untried");
  assert.equal(
    describeSource(snapshotOf({ a: { score: 0.9, weight: 8 } }), "a"),
    "reliable here",
  );
  assert.equal(
    describeSource(snapshotOf({ a: { score: 0.02, weight: 8 } }), "a"),
    "rarely works",
  );
  assert.equal(
    describeSource(snapshotOf({ a: { score: 0.6, weight: 8 } }), "a"),
    "usually works",
  );
  assert.equal(
    describeSource(snapshotOf({ a: { score: 0.3, weight: 8 } }), "a"),
    "hit and miss",
  );
});
