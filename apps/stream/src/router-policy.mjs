
import {
  EXPLORE_WEIGHT_FLOOR,
  TITLE_WEIGHT_CAP,
} from "./source-score.mjs";
import {
  fallbackPlaybackPreferenceForHints,
  fallbackPreferenceForHints,
  sourcePlaybackHints,
} from "./source-observations.mjs";

export const MAX_WAVE = 5;

export const MIN_WAVE = 2;

export const GRACE_MS = 1_200;
export const HARD_MS = 4_000;

export const SOURCE_COOLDOWN_MS = 60_000;

export const CONFIDENT_FAIL_SCORE = 0.08;
export const CONFIDENT_FAIL_WEIGHT = 4;

const EXCELLENT_TIER = 3;
const DECENT_TIER = 2;
const PROVEN_SCORE = 0.8;
const PROVEN_TITLE_WEIGHT = 3;

const MAX_TIER = 4;

const OFFER_W_TIER = 0.55;
const OFFER_W_SCORE = 0.3;
const OFFER_W_SPEED = 0.15;
const OFFER_SPEED_CEILING_MS = 6_000;

export const RATE_LIMIT_COOLDOWN_MS = 30_000;
export const MIN_COOLDOWN_MS = 10_000;
export const MAX_COOLDOWN_MS = 30_000;

function clamp(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

export function orderSources(sources, snapshot, options = {}) {
  const {
    pinned = null,
    cooling = {},
    now = 0,
    preferredAudioLanguage = "und",
  } = options;
  if (pinned) return sources.some((id) => id === pinned) ? [pinned] : [];
  const priority = new Map(sources.map((id, index) => [id, index]));

  const scored = sources.map((id) => ({
    id,
    score: snapshot.score(id),
    weight: snapshot.weight(id),
    cooling: (cooling[id] ?? 0) > now,
    hintScore:
      fallbackPreferenceForHints(
        sourcePlaybackHints(id),
        preferredAudioLanguage,
      ) *
        100 +
      fallbackPlaybackPreferenceForHints(sourcePlaybackHints(id)),
  }));

  const isSpent = (entry) =>
    entry.score < CONFIDENT_FAIL_SCORE && entry.weight >= CONFIDENT_FAIL_WEIGHT;

  const available = scored.filter((entry) => !entry.cooling);
  const main = available.filter((entry) => !isSpent(entry));
  const tail = available.filter((entry) => isSpent(entry));

  main.sort(
    (left, right) =>
      right.score - left.score ||
      right.hintScore - left.hintScore ||
      (priority.get(left.id) ?? 0) - (priority.get(right.id) ?? 0),
  );
  tail.sort(
    (left, right) =>
      right.score - left.score ||
      right.hintScore - left.hintScore ||
      (priority.get(left.id) ?? 0) - (priority.get(right.id) ?? 0),
  );

  const ordered = main.map((entry) => entry.id);
  const explorer = pickExplorer(main);
  if (explorer !== null) {
    const slot = Math.min(MAX_WAVE - 1, ordered.length - 1);
    const from = ordered.indexOf(explorer);
    if (from > slot) {
      ordered.splice(from, 1);
      ordered.splice(slot, 0, explorer);
    }
  }

  return [...ordered, ...tail.map((entry) => entry.id)];
}

function pickExplorer(entries) {
  let best = null;
  for (const entry of entries) {
    if (entry.weight >= EXPLORE_WEIGHT_FLOOR) continue;
    if (!best || entry.weight < best.weight) best = entry;
  }
  return best ? best.id : null;
}

export function nextWaveSize(current, sawRateLimit) {
  if (sawRateLimit) return MIN_WAVE;
  return Math.min(MAX_WAVE, Math.max(MIN_WAVE, current + 1));
}

export function bestVerifiedTier(offer) {
  return offer.verifiedTier ?? 0;
}

export function isExcellent(offer) {
  return (
    offer.audioFallback !== true &&
    Boolean(offer.verified) &&
    bestVerifiedTier(offer) >= EXCELLENT_TIER
  );
}

export function isGoodEnough(offer, snapshot) {
  if (offer.audioFallback === true) return false;
  if (isExcellent(offer)) return true;
  return (
    Boolean(offer.verified) &&
    bestVerifiedTier(offer) >= DECENT_TIER &&
    snapshot.score(offer.sourceId) >= PROVEN_SCORE &&
    snapshot.titleWeight(offer.sourceId) >= PROVEN_TITLE_WEIGHT
  );
}

export function offerScore(offer, snapshot) {
  const tier = clamp(bestVerifiedTier(offer) / MAX_TIER, 0, 1);
  const speed = clamp(1 - (offer.totalMs ?? 0) / OFFER_SPEED_CEILING_MS, 0, 1);
  const quality =
    OFFER_W_TIER * tier +
    OFFER_W_SCORE * snapshot.score(offer.sourceId) +
    OFFER_W_SPEED * speed;
  if (offer.audioFallback === true) {
    const observationalPreference = clamp(
      offer.fallbackPreference ?? 5.5 / 15,
      0,
      1,
    );
    const playbackPreference = clamp(
      offer.fallbackPlaybackPreference ?? 0.5,
      0,
      1,
    );
    return observationalPreference + playbackPreference / 100 + quality / 10_000;
  }
  return 2 + quality;
}

export function graceDeadline(now, raceStartedAt) {
  return Math.min(now + GRACE_MS, raceStartedAt + HARD_MS);
}

export function initialRaceState(now) {
  return {
    raceStartedAt: now,
    held: null,
    graceUntil: Number.POSITIVE_INFINITY,
    attaching: null,
    cooldownHintMs: 0,
    sawRateLimit: false,
    exhausted: false,
  };
}

const CONTINUE = { type: "continue" };

export function raceStep(state, event, now, snapshot) {
  switch (event.type) {
    case "offer": {
      if (state.attaching) return { state, action: CONTINUE };

      const offer = event.offer;
      if (isGoodEnough(offer, snapshot)) {
        return {
          state: { ...state, held: null, attaching: offer.sourceId },
          action: { type: "attach", offer },
        };
      }

      const held =
        !state.held || offerScore(offer, snapshot) > offerScore(state.held, snapshot)
          ? offer
          : state.held;
      const replacedUnverifiedWithVerified =
        state.held?.audioFallback === true &&
        held === offer &&
        offer.audioFallback !== true;
      const graceUntil = !state.held
        ? offer.audioFallback === true
          ? state.raceStartedAt + HARD_MS
          : graceDeadline(now, state.raceStartedAt)
        : replacedUnverifiedWithVerified
          ? graceDeadline(now, state.raceStartedAt)
          : state.graceUntil;

      if (state.exhausted) {
        return {
          state: { ...state, held: null, attaching: held.sourceId },
          action: { type: "attach", offer: held },
        };
      }

      return { state: { ...state, held, graceUntil }, action: CONTINUE };
    }

    case "failure": {
      const sawRateLimit = state.sawRateLimit || event.kind === "limited";
      const next = {
        ...state,
        sawRateLimit,
        cooldownHintMs: Math.max(state.cooldownHintMs, event.retryAfterMs ?? 0),
      };
      if (event.kind === "limited") {
        if (next.held && !next.attaching) {
          return {
            state: { ...next, held: null, attaching: next.held.sourceId },
            action: { type: "attach", offer: next.held },
          };
        }
        return {
          state: next,
          action: {
            type: "stop",
            reason: "rateLimited",
            cooldownMs: Math.max(next.cooldownHintMs, RATE_LIMIT_COOLDOWN_MS),
          },
        };
      }
      return { state: next, action: CONTINUE };
    }

    case "tick": {
      if (state.attaching || !state.held) return { state, action: CONTINUE };
      if (now < state.graceUntil) return { state, action: CONTINUE };
      return {
        state: { ...state, held: null, attaching: state.held.sourceId },
        action: { type: "attach", offer: state.held },
      };
    }

    case "attachFailed": {
      const next = { ...state, attaching: null };
      if (next.exhausted && !next.held) {
        return {
          state: next,
          action: {
            type: "stop",
            reason: "exhausted",
            cooldownMs: exhaustedCooldown(next),
          },
        };
      }
      if (next.held) {
        return {
          state: { ...next, held: null, attaching: next.held.sourceId },
          action: { type: "attach", offer: next.held },
        };
      }
      return { state: next, action: CONTINUE };
    }

    case "exhausted": {
      const next = { ...state, exhausted: true };
      if (next.attaching) return { state: next, action: CONTINUE };
      if (next.held) {
        return {
          state: { ...next, held: null, attaching: next.held.sourceId },
          action: { type: "attach", offer: next.held },
        };
      }
      return {
        state: next,
        action: {
          type: "stop",
          reason: next.sawRateLimit ? "rateLimited" : "exhausted",
          cooldownMs: exhaustedCooldown(next),
        },
      };
    }

    default:
      return { state, action: CONTINUE };
  }
}

function exhaustedCooldown(state) {
  if (state.sawRateLimit) {
    return Math.max(state.cooldownHintMs, RATE_LIMIT_COOLDOWN_MS);
  }
  return Math.min(
    MAX_COOLDOWN_MS,
    Math.max(MIN_COOLDOWN_MS, state.cooldownHintMs),
  );
}

export function describeSource(snapshot, sourceId) {
  const weight = snapshot.weight(sourceId);
  if (weight < 0.5) return "untried";
  const score = snapshot.score(sourceId);
  if (score < CONFIDENT_FAIL_SCORE) return "rarely works";
  if (score >= PROVEN_SCORE) return "reliable here";
  if (score >= 0.5) return "usually works";
  return "hit and miss";
}

export { EXPLORE_WEIGHT_FLOOR, TITLE_WEIGHT_CAP };
