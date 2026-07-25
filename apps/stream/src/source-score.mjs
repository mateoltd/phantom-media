/**
 * What each playback source is worth, learned from watching it work.
 *
 * The router used to attach whichever source answered first, so a fast source
 * with a 480p file beat a slower one with 1080p, and every visit started from
 * nothing. This module is the memory: it turns one race against one source
 * into a number between 0 and 1, folds that into a running mean that fades
 * with age, and blends a global record with what is known about the exact
 * title on screen.
 *
 * Pure by design. Storage lives in `lib/source-score.ts`, the ordering that
 * uses these numbers lives in `router-policy.mjs`, and neither of those can be
 * unit tested — this can, so every decision worth arguing about is here.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

/** Rewards and posteriors are all in [0, 1], so they can be read at a glance. */
const MIN = 0;
const MAX = 1;

/* -------------------------------------------------------------------------- */
/* Reward                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether a source produced anything at all dominates: one that comes up empty
 * three times in five cannot be first no matter how good the other two were.
 * Resolution is next because the difference is plain to see. Speed matters
 * least — half a second is not something anyone notices, and it is the term
 * most polluted by whatever else the connection was doing at the time.
 */
const W_OUTCOME = 0.5;
const W_QUALITY = 0.3;
const W_SPEED = 0.2;

/**
 * Roughly the client's own resolve deadline plus a probe. A source that only
 * just beats the deadline scores nothing for speed; one that answers in 1.5s
 * scores 0.81.
 */
const SPEED_CEILING_MS = 8_000;

/**
 * A source that plays for twenty seconds and dies costs more than one that
 * offered nothing, because by then the viewer has committed. Half drags a
 * perfect observation below the average of a merely working source.
 */
const STALL_PENALTY = 0.5;

/** The best tier `qualityTier` can report, used to normalise into [0, 1]. */
const MAX_TIER = 4;

function clamp(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

/**
 * A 429 is armed process-wide and upstream-wide, so whichever source happened
 * to be in flight when the limiter tripped is not the one at fault. Recording
 * it would poison a source for something it did not do.
 */
export function shouldRecord(observation) {
  return observation.outcome !== "limited";
}

export function reward(observation) {
  let base = 0;

  if (observation.outcome === "verified") {
    const quality = clamp(observation.tier / MAX_TIER, MIN, MAX);
    const elapsed = observation.attached
      ? (observation.resolveMs ?? 0) + (observation.ttffMs ?? 0)
      : (observation.resolveMs ?? 0) + (observation.probeMs ?? 0);
    const speed = clamp(1 - elapsed / SPEED_CEILING_MS, MIN, MAX);
    base = W_OUTCOME + W_QUALITY * quality + W_SPEED * speed;
  }

  return clamp(base - (observation.stalled ? STALL_PENALTY : 0), MIN, MAX);
}

/* -------------------------------------------------------------------------- */
/* Records and decay                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How long the evidence a source is any good stays worth half of what it was.
 *
 * Source health is volatile — hosts break, get blocked, and come back — so a
 * week means a source that dies on Monday has lost half its standing by the
 * next. Whether a source *carries a particular title* is a near-static fact
 * about a library, so that decays four times more slowly; throwing it away
 * weekly would discard the most specific thing we know.
 */
export const HALF_LIFE_GLOBAL_MS = 7 * 24 * 60 * 60 * 1_000;
export const HALF_LIFE_TITLE_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Without a cap a favourite accumulates unbounded weight and needs dozens of
 * failures to be dethroned. At twenty, a bad run halves its value in fifteen
 * observations and the time decay finishes the job.
 */
export const WEIGHT_CAP = 20;

/**
 * A new source is assumed to be slightly better than a proven mediocre one and
 * clearly worse than a proven good one, so it gets tried without displacing a
 * known winner. One empty result drops it to 0.275 immediately, which is what
 * makes the optimism cheap.
 */
export const PRIOR_VALUE = 0.55;
export const PRIOR_WEIGHT = 1;

/** Under this many effective observations, a source is still being learned. */
export const EXPLORE_WEIGHT_FLOOR = 3;

/** How much per-title evidence has to pile up before it outvotes the global record. */
export const GLOBAL_PRIOR_WEIGHT = 2;
export const TITLE_WEIGHT_CAP = 6;

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function emptyRecord(now) {
  return { v: 0, w: 0, t: now };
}

/**
 * How much of a record's weight survives the wait since it was written.
 *
 * This is the whole reason a plain exponential average was not enough: a fixed
 * smoothing factor treats a source last measured three weeks ago as freshly
 * confirmed, which is exactly how a source that has gone bad keeps winning.
 */
export function decayFactor(record, now, halfLifeMs) {
  if (!record || !Number.isFinite(record.t)) return 0;
  const age = now - record.t;
  if (age <= 0) return 1;
  return 2 ** (-age / halfLifeMs);
}

/**
 * Folds one reward into a record. The result is a running mean whose smoothing
 * adapts to elapsed time, and whose weight doubles as an effective observation
 * count — which is what cold start and the two-tier blend both need, so one
 * mechanism does three jobs.
 */
export function update(record, r, now, halfLifeMs) {
  const previous = record ?? emptyRecord(now);
  const decayed = decayFactor(previous, now, halfLifeMs) * previous.w;
  const weight = decayed + 1;
  return {
    v: round((decayed * previous.v + r) / weight, 3),
    w: round(Math.min(weight, WEIGHT_CAP), 2),
    t: now,
  };
}

/**
 * The value a record argues for, tempered by how much it has earned the right
 * to. Decay is applied to the weight only: uniformly fading every observation
 * leaves a mean where it was, and what should actually fall with time is
 * confidence, not the estimate itself.
 */
export function posterior(record, now, halfLifeMs) {
  const weight = record ? decayFactor(record, now, halfLifeMs) * record.w : 0;
  const value = record ? record.v : 0;
  return (PRIOR_VALUE * PRIOR_WEIGHT + value * weight) / (PRIOR_WEIGHT + weight);
}

/** The decayed observation count, which is what exploration decides on. */
export function effectiveWeight(record, now, halfLifeMs) {
  return record ? decayFactor(record, now, halfLifeMs) * record.w : 0;
}

/* -------------------------------------------------------------------------- */
/* The two tiers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Per season rather than per episode. Whether a source carries a series is a
 * property of the pack it ingested, and per-episode keys would be ten to
 * twenty times the entries while almost never gathering enough weight to say
 * anything.
 */
export function titleKeyFor(mediaType, id, season) {
  return mediaType === "tv" ? `tv:${id}:${season}` : `movie:${id}`;
}

/**
 * The global record is the prior that evidence about this exact title shifts.
 *
 * With nothing recorded for the title this collapses to the global posterior
 * exactly, not approximately. Two observations make it an even split, six or
 * more let the title outvote the global record three to one — which is the ask
 * in one line: a title that loads fast and clean from one source bends that
 * title toward it, while everything unmeasured still follows the general
 * record.
 */
export function blendedScore(globalRecord, titleRecord, now) {
  const global = posterior(globalRecord, now, HALF_LIFE_GLOBAL_MS);
  const weight = Math.min(
    effectiveWeight(titleRecord, now, HALF_LIFE_TITLE_MS),
    TITLE_WEIGHT_CAP,
  );
  const value = titleRecord ? titleRecord.v : 0;
  return (
    (global * GLOBAL_PRIOR_WEIGHT + value * weight) /
    (GLOBAL_PRIOR_WEIGHT + weight)
  );
}

/* -------------------------------------------------------------------------- */
/* Merging, for a store that is not device-local                              */
/* -------------------------------------------------------------------------- */

/**
 * Two records of the same source, combined. Exported because it is what a
 * shared store would need and what makes one possible without a schema change:
 * the weighted mean of weighted means is itself a weighted mean, so many
 * devices' opinions aggregate the same way one device's observations do.
 */
export function mergeRecords(left, right) {
  if (!left) return right ? { ...right } : null;
  if (!right) return { ...left };
  const weight = left.w + right.w;
  if (weight <= 0) return { v: 0, w: 0, t: Math.max(left.t, right.t) };
  return {
    v: round((left.v * left.w + right.v * right.w) / weight, 3),
    w: round(Math.min(weight, WEIGHT_CAP), 2),
    t: Math.max(left.t, right.t),
  };
}

/* -------------------------------------------------------------------------- */
/* Region                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The continent segment of an IANA zone, and nothing finer.
 *
 * This is the honest limit of what a browser will say about where it is. It is
 * coarse on purpose: an exit node hopping between American cities must not
 * invalidate anything, while a device that genuinely moves between continents
 * should. It is a partition label for a store that does not yet need
 * partitioning, never a thing to show anyone, and it cannot predict a
 * geo-block or choose a nearer host.
 */
export function coarseRegion(timeZone) {
  const zone = typeof timeZone === "string" ? timeZone : "";
  return zone.split("/")[0] || "unknown";
}

/**
 * Moving between continents makes past measurements suspect but not wrong —
 * which source carries which title travels, while which one is reachable and
 * fast does not. Halving weights keeps the ordering hint and restores
 * exploration; wiping would throw away good information over a plane trip.
 */
export function relocate(records) {
  const out = {};
  for (const [key, record] of Object.entries(records)) {
    out[key] = { ...record, w: round(record.w / 2, 2) };
  }
  return out;
}
