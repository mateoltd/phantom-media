/**
 * Every decision the source router makes, with none of the machinery that
 * makes it hard to test.
 *
 * The old router attached whichever source answered first. That is why a fast
 * source holding a 480p file beat a slower one holding 1080p, and why picking
 * a source by hand worked better than waiting. The fix is a short window: an
 * offer that is already excellent goes on screen immediately, and anything
 * less is held for a moment to see whether something better is close behind.
 *
 * The window is written here as a reducer rather than as control flow in the
 * driver, because a state machine expressed as `await`s and timers is the kind
 * of code that is only ever debugged in production. As a pure function, every
 * branch below is asserted in `test/router-policy.test.mjs`.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

import {
  EXPLORE_WEIGHT_FLOOR,
  TITLE_WEIGHT_CAP,
} from "./source-score.mjs";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How many sources are asked at once.
 *
 * Not fourteen: one request here is one request upstream, and a single 429
 * arms a cooldown that blacks out every source on the isolate, so a wide burst
 * is actively dangerous rather than merely rude. Not eight: five resolvers
 * each probing up to six variants is already thirty cross-origin fetches.
 */
export const MAX_WAVE = 5;

/** Where a wave restarts after a rate limit, before climbing back. */
export const MIN_WAVE = 2;

/**
 * How long an unremarkable offer is held to see whether a better one lands.
 *
 * The window can never make the good case slower: an excellent offer skips it,
 * and the ceiling is measured from the start of the race rather than from the
 * offer, so a first answer at 3.9s waits 100ms instead of the full window.
 */
export const GRACE_MS = 1_200;
export const HARD_MS = 4_000;

/**
 * A source seen to be reachable but useless is not asked again for a minute.
 * Without this, every episode change re-asks a host that is currently down.
 */
export const SOURCE_COOLDOWN_MS = 60_000;

/**
 * Below this score, with enough evidence to mean it, a source stops being
 * asked in the main run. It is never dropped — sources recover, and a roster
 * that only shrinks would end up empty — but it moves behind everything else,
 * which is the single most effective way to stop provoking the rate limiter.
 */
export const CONFIDENT_FAIL_SCORE = 0.08;
export const CONFIDENT_FAIL_WEIGHT = 4;

/** A tier at or above this is worth putting on screen without deliberating. */
const EXCELLENT_TIER = 3;
/** A tier at or above this is worth it only from a source proven on this title. */
const DECENT_TIER = 2;
const PROVEN_SCORE = 0.8;
const PROVEN_TITLE_WEIGHT = 3;

const MAX_TIER = 4;

/** Weights for choosing between offers that have all already arrived. */
const OFFER_W_TIER = 0.55;
const OFFER_W_SCORE = 0.3;
const OFFER_W_SPEED = 0.15;
const OFFER_SPEED_CEILING_MS = 6_000;

/** Cooldown floors, preserved from the behaviour this replaces. */
export const RATE_LIMIT_COOLDOWN_MS = 30_000;
export const MIN_COOLDOWN_MS = 10_000;
export const MAX_COOLDOWN_MS = 30_000;

function clamp(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The order sources are asked in.
 *
 * Pinning short-circuits everything: when the viewer names a source, that is
 * the only one asked, because quietly playing a different one is exactly the
 * behaviour that made hand-picking feel unreliable.
 *
 * Otherwise sources sort by what is known about them, with two adjustments.
 * Sources proven bad fall to a tail that is only reached if the main run is
 * exhausted. And while any source is still being learned, the last slot of the
 * first wave is reserved for the least-observed one regardless of its score —
 * an optimistic prior alone can bury a source that was unlucky twice, and
 * because the wave is parallel this costs nothing unless the explorer wins, in
 * which case it earned the slot.
 */
export function orderSources(sources, snapshot, options = {}) {
  const { pinned = null, cooling = {}, now = 0 } = options;
  if (pinned) return sources.some((id) => id === pinned) ? [pinned] : [];

  const scored = sources.map((id) => ({
    id,
    score: snapshot.score(id),
    weight: snapshot.weight(id),
    cooling: (cooling[id] ?? 0) > now,
  }));

  const isSpent = (entry) =>
    entry.score < CONFIDENT_FAIL_SCORE && entry.weight >= CONFIDENT_FAIL_WEIGHT;

  const main = scored.filter((entry) => !isSpent(entry) && !entry.cooling);
  const tail = scored.filter((entry) => isSpent(entry) || entry.cooling);

  main.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  tail.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

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

  // Sources that are cooling or spent stay on the list. A roster that only
  // ever shrinks eventually has nothing left to offer.
  return [...ordered, ...tail.map((entry) => entry.id)];
}

/**
 * The least-observed source, when any source is still under the floor. Chosen
 * deterministically rather than at random: a coin flip inside a pure function
 * is untestable, and this self-terminates once everything has been measured.
 */
function pickExplorer(entries) {
  let best = null;
  for (const entry of entries) {
    if (entry.weight >= EXPLORE_WEIGHT_FLOOR) continue;
    if (!best || entry.weight < best.weight) best = entry;
  }
  return best ? best.id : null;
}

/**
 * How wide the next race may go. A rate limit drops it hard and it climbs back
 * one source at a time, so a limiter that has been provoked is given room to
 * settle without giving up parallelism for the rest of the sitting.
 */
export function nextWaveSize(current, sawRateLimit) {
  if (sawRateLimit) return MIN_WAVE;
  return Math.min(MAX_WAVE, Math.max(MIN_WAVE, current + 1));
}

/* -------------------------------------------------------------------------- */
/* Judging an offer                                                           */
/* -------------------------------------------------------------------------- */

/** The best tier among candidates whose manifest actually answered. */
export function bestVerifiedTier(offer) {
  return offer.verifiedTier ?? 0;
}

/**
 * Good enough to stop looking.
 *
 * Verification is the point. An mp4 that merely *claims* 1080p is the top tier
 * and has proven nothing, and attaching an unverified claim on sight is how a
 * fast lie beats a slow truth — which is the failure this whole module exists
 * to fix.
 */
export function isExcellent(offer) {
  return Boolean(offer.verified) && bestVerifiedTier(offer) >= EXCELLENT_TIER;
}

/**
 * Excellent, or merely decent from a source that has already carried this
 * exact title several times. That second clause is the scoring system paying
 * for itself: earned trust buys the right to skip the window.
 */
export function isGoodEnough(offer, snapshot) {
  if (isExcellent(offer)) return true;
  return (
    Boolean(offer.verified) &&
    bestVerifiedTier(offer) >= DECENT_TIER &&
    snapshot.score(offer.sourceId) >= PROVEN_SCORE &&
    snapshot.titleWeight(offer.sourceId) >= PROVEN_TITLE_WEIGHT
  );
}

/**
 * Which of two offers to keep. Resolution weighs more here than it does in the
 * persisted reward, because that one asks "was this a good source" — where
 * working at all dominates — and this one asks "which of these two working
 * streams do I want", where resolution is the entire reason to be deciding.
 * Speed counts for least: both have already arrived, so the difference between
 * them is spent.
 */
export function offerScore(offer, snapshot) {
  const tier = clamp(bestVerifiedTier(offer) / MAX_TIER, 0, 1);
  const speed = clamp(1 - (offer.totalMs ?? 0) / OFFER_SPEED_CEILING_MS, 0, 1);
  return (
    OFFER_W_TIER * tier +
    OFFER_W_SCORE * snapshot.score(offer.sourceId) +
    OFFER_W_SPEED * speed
  );
}

/** When the held offer stops waiting, measured so the race can never overrun. */
export function graceDeadline(now, raceStartedAt) {
  return Math.min(now + GRACE_MS, raceStartedAt + HARD_MS);
}

/* -------------------------------------------------------------------------- */
/* The race                                                                   */
/* -------------------------------------------------------------------------- */

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

/**
 * One step of the race.
 *
 * The driver owns the fetching and the video element; every choice about what
 * to do next is made here, where it can be asserted.
 */
export function raceStep(state, event, now, snapshot) {
  switch (event.type) {
    case "offer": {
      // Something is already going on screen. A second offer arriving during
      // an attach is not a reason to interrupt a picture that is loading.
      if (state.attaching) return { state, action: CONTINUE };

      const offer = event.offer;
      if (isGoodEnough(offer, snapshot)) {
        return {
          state: { ...state, held: null, attaching: offer.sourceId },
          action: { type: "attach", offer },
        };
      }

      // Nothing here is worth stopping for, so hold the best of what has
      // arrived and let the window run.
      const held =
        !state.held || offerScore(offer, snapshot) > offerScore(state.held, snapshot)
          ? offer
          : state.held;
      const graceUntil = state.held
        ? state.graceUntil
        : graceDeadline(now, state.raceStartedAt);

      // The last source has already answered, so there is nothing to wait for.
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
      // A rate limit is upstream-wide, so asking the rest would only deepen
      // it. Anything already held is still worth playing.
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
      // The race was never stopped, so collection simply carries on. This is
      // the difference that matters: the loop this replaces awaited the
      // attach, so a failure froze the whole race for the startup timeout and
      // started no replacement work in the meantime.
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
      // Everything has answered and one of them was playable. Failing here
      // because the window had not expired would throw away a working stream
      // for no reason at all.
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

/* -------------------------------------------------------------------------- */
/* Wording                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the source menu says about a source before this sitting has learned
 * anything, so the roster is useful on arrival rather than only in hindsight.
 */
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
