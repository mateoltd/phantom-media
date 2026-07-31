
const MIN = 0;
const MAX = 1;

const W_OUTCOME = 0.5;
const W_QUALITY = 0.3;
const W_SPEED = 0.2;

const SPEED_CEILING_MS = 8_000;

const STALL_PENALTY = 0.5;

const MAX_TIER = 4;

function clamp(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

export function shouldRecord(observation) {
  return observation.outcome !== "limited";
}

export function observationScopes(observation) {
  switch (observation.outcome) {
    case "verified":
      return { global: true, title: true };
    case "empty":
      return { global: false, title: true };
    case "unreachable":
      return { global: true, title: false };
    default:
      return { global: false, title: false };
  }
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

export const HALF_LIFE_GLOBAL_MS = 7 * 24 * 60 * 60 * 1_000;
export const HALF_LIFE_TITLE_MS = 30 * 24 * 60 * 60 * 1_000;

export const WEIGHT_CAP = 20;

export const PRIOR_VALUE = 0.55;
export const PRIOR_WEIGHT = 1;

export const EXPLORE_WEIGHT_FLOOR = 3;

export const GLOBAL_PRIOR_WEIGHT = 2;
export const TITLE_WEIGHT_CAP = 6;

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function emptyRecord(now) {
  return { v: 0, w: 0, t: now };
}

export function decayFactor(record, now, halfLifeMs) {
  if (!record || !Number.isFinite(record.t)) return 0;
  const age = now - record.t;
  if (age <= 0) return 1;
  return 2 ** (-age / halfLifeMs);
}

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

export function posterior(record, now, halfLifeMs) {
  const weight = record ? decayFactor(record, now, halfLifeMs) * record.w : 0;
  const value = record ? record.v : 0;
  return (PRIOR_VALUE * PRIOR_WEIGHT + value * weight) / (PRIOR_WEIGHT + weight);
}

export function effectiveWeight(record, now, halfLifeMs) {
  return record ? decayFactor(record, now, halfLifeMs) * record.w : 0;
}

export function titleKeyFor(mediaType, id, season) {
  return mediaType === "tv" ? `tv:${id}:${season}` : `movie:${id}`;
}

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

export function coarseRegion(timeZone) {
  const zone = typeof timeZone === "string" ? timeZone : "";
  return zone.split("/")[0] || "unknown";
}

export function relocate(records) {
  const out = {};
  for (const [key, record] of Object.entries(records)) {
    out[key] = { ...record, w: round(record.w / 2, 2) };
  }
  return out;
}
