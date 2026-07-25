"use client";

import { asSettled, type Settled } from "./concurrent";
import { debug, debugRequestHeaders, readServerTiming, span } from "./debug";
import { probeCandidates } from "./player";
import {
  initialRaceState,
  raceStep,
  type FailureKind,
  type RaceState,
  type RouterEvent,
  type ScoreSnapshot,
  type SourceOffer,
} from "../src/router-policy.mjs";
import type { MediaResult, ResolverResponse } from "./types";

/**
 * The machinery behind the source race. Every choice it makes is made for it
 * by `src/router-policy.mjs`; what lives here is fetching, timing out, and
 * knowing when to stop.
 */

/**
 * How long one source gets to answer.
 *
 * There was no limit at all before, which is where the minute-long waits came
 * from: a single upstream that never replied held its slot open forever and
 * the race simply stopped moving.
 *
 * Five rather than seven, because this is not the only thing the slot pays
 * for. Probing runs after it and inside the same slot, so the number that
 * matters is the sum: five here plus one round of probing is a hair under
 * seven seconds, and a slot is the scarcest thing in the race — every source
 * still queued waits behind whoever is holding one. A working scrape lands in
 * one and a half to four seconds, so five still covers the honest tail; what
 * it stops covering is the pathology.
 */
export const RESOLVE_TIMEOUT_MS = 5_000;

/** How long a manifest gets to answer during probing. One round, so this is
 *  also the whole probe phase. */
export const PROBE_TIMEOUT_MS = 1_800;

/** What one source may cost the race, end to end. Asserted, not assumed. */
export const ASK_BUDGET_MS = RESOLVE_TIMEOUT_MS + PROBE_TIMEOUT_MS + 200;

/** How long the video element gets to produce a picture from one candidate. */
export const STARTUP_TIMEOUT_MS = 5_000;
/** Longer when the viewer named the source: they asked for that one. */
export const PINNED_STARTUP_TIMEOUT_MS = 6_000;

/** Two goes per source. A third is almost always the same failure again. */
export const MAX_ATTEMPTS_PER_SOURCE = 2;

export class SourceFailure extends Error {
  kind: FailureKind;
  retryAfterMs: number | null;
  status: number;

  constructor(
    message: string,
    kind: FailureKind,
    options: { status?: number; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.name = "SourceFailure";
    this.kind = kind;
    this.status = options.status ?? 0;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

interface ResolverFailureBody {
  error?: string;
  retryable?: boolean;
  retryAfterMs?: number | null;
  server?: string | null;
}

export interface AskContext {
  media: MediaResult;
  season: number;
  episode: number;
  label(sourceId: string): string;
  signal: AbortSignal;
}

/**
 * Asks one source, then checks what it offered before believing it.
 *
 * The check is the point. A source can list a 1080p file and serve nothing at
 * that address, and the router used to attach it purely because it answered
 * first — so a candidate whose manifest actually responds always outranks one
 * that merely exists.
 */
export async function askSource(
  sourceId: string,
  context: AskContext,
): Promise<SourceOffer> {
  const label = context.label(sourceId);
  const startedAt = performance.now();

  const params = new URLSearchParams({
    type: context.media.mediaType,
    tmdbId: String(context.media.tmdbId),
    server: sourceId,
    title: context.media.title,
    year: context.media.year.slice(0, 4),
  });
  if (context.media.imdbId) params.set("imdbId", context.media.imdbId);
  if (context.media.mediaType === "tv") {
    params.set("season", String(context.season));
    params.set("episode", String(context.episode));
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  context.signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, RESOLVE_TIMEOUT_MS);

  const done = span("source", "ask", { source: label });

  let payload: ResolverResponse & ResolverFailureBody;
  let response: Response;
  try {
    response = await fetch(`/api/sources/resolve?${params}`, {
      signal: controller.signal,
      headers: debugRequestHeaders(),
    });
    debug("source", "http", {
      source: label,
      status: response.status,
      ms: performance.now() - startedAt,
      server: readServerTiming(response),
    });
    payload = (await response.json()) as ResolverResponse & ResolverFailureBody;
  } catch (error) {
    // The caller's own abort has to stay an abort: it means a different source
    // already won, not that this one is broken.
    if (context.signal.aborted) {
      done({ outcome: "abandoned", source: label });
      throw error;
    }
    done({ outcome: "timeout", source: label });
    throw new SourceFailure(`${label} did not answer`, "unreachable");
  } finally {
    window.clearTimeout(timeout);
    context.signal.removeEventListener("abort", abort);
  }

  if (!response.ok) {
    // A retryable failure that names no source is the whole relay, not this
    // one, so the race stops rather than working through thirteen more.
    const limited =
      response.status === 429 || (Boolean(payload.retryable) && !payload.server);
    done({
      outcome: limited ? "limited" : "unreachable",
      source: label,
      status: response.status,
      retryAfterMs: payload.retryAfterMs ?? null,
    });
    throw new SourceFailure(
      payload.error || `${label} returned HTTP ${response.status}`,
      limited ? "limited" : "unreachable",
      { status: response.status, retryAfterMs: payload.retryAfterMs ?? null },
    );
  }

  const resolveMs = performance.now() - startedAt;
  if (!payload.candidates?.length) {
    done({ outcome: "empty", source: label, resolveMs });
    throw new SourceFailure(`${label} offered no streams`, "empty");
  }

  let probe;
  try {
    probe = await probeCandidates(payload.candidates, {
      timeoutMs: PROBE_TIMEOUT_MS,
      signal: context.signal,
    });
  } catch (error) {
    // Only raised when the race itself was cancelled, but the span still has
    // to be closed or the log grows a start with no end for every source that
    // was in flight when a winner was found.
    done({ outcome: "abandoned", source: label });
    throw error;
  }
  debug("source", "probed", {
    source: label,
    offered: payload.candidates.length,
    verified: probe.verified.length,
    failed: probe.failed.length,
    tier: probe.verifiedTier,
    ms: performance.now() - startedAt - resolveMs,
  });

  // Nothing verified means every manifest was a dead address, so only fixed
  // files are worth trying. A failed manifest is never retried blind.
  const attempts = (
    probe.verified.length > 0
      ? probe.verified
      : probe.ranked.filter((candidate) => candidate.type !== "hls")
  ).slice(0, MAX_ATTEMPTS_PER_SOURCE);

  if (attempts.length === 0) {
    done({ outcome: "unplayable", source: label, resolveMs });
    throw new SourceFailure(`${label} had nothing playable`, "empty");
  }

  done({
    outcome: "offer",
    source: label,
    resolveMs,
    verified: probe.verified.length > 0,
    tier: probe.verifiedTier,
    attempts: attempts.length,
  });

  return {
    sourceId,
    label,
    verified: probe.verified.length > 0,
    verifiedTier: probe.verifiedTier,
    totalMs: performance.now() - startedAt,
    ranked: probe.ranked,
    attempts,
    subtitles: payload.subtitles ?? [],
    resolveMs,
    probeMs: probe.probeMs,
  };
}

/* -------------------------------------------------------------------------- */
/* The race                                                                   */
/* -------------------------------------------------------------------------- */

export type RaceOutcome =
  | { ok: true; offer: SourceOffer }
  | { ok: false; reason: "rateLimited" | "exhausted" | "cancelled"; cooldownMs: number };

export interface RaceDeps {
  order: readonly string[];
  wave: number;
  snapshot: ScoreSnapshot;
  signal: AbortSignal;
  ask(sourceId: string): Promise<SourceOffer>;
  attach(offer: SourceOffer): Promise<void>;
  onAsking?(sourceId: string): void;
  onOffer?(offer: SourceOffer): void;
  onHolding?(offer: SourceOffer): void;
  onAttaching?(offer: SourceOffer): void;
  onFailure?(sourceId: string, failure: SourceFailure): void;
  now?(): number;
}

type Winner =
  | { kind: "settled"; result: IteratorResult<Settled<string, SourceOffer>> }
  | { kind: "tick" }
  | { kind: "attached" }
  | { kind: "attachFailed"; sourceId: string };

function armTick(deadline: number, now: () => number) {
  let timer = 0;
  const promise = new Promise<Winner>((resolve) => {
    timer = window.setTimeout(
      () => resolve({ kind: "tick" }),
      Math.max(0, deadline - now()),
    );
  });
  return { promise, cancel: () => window.clearTimeout(timer) };
}

/**
 * Runs the race and returns what happened.
 *
 * Three things here are the difference between this and the loop it replaces,
 * and all three were causes of the wait people noticed:
 *
 * The window needs its own timer. `asSettled` only wakes when a source
 * settles, so a held offer would sit there until the next one answered — which
 * on a bad night is never.
 *
 * Exactly one `next()` may be outstanding. An async generator serialises
 * queued calls and hands the first result to the first caller, so dropping a
 * pending promise and asking again silently loses an offer.
 *
 * Attaching is raced, never awaited. The old loop awaited it, so a source that
 * failed to start froze the race for the whole startup timeout and began no
 * replacement work in the meantime. Here collection carries on throughout, and
 * a failed attach costs only the element.
 */
export async function runRace(deps: RaceDeps): Promise<RaceOutcome> {
  const done = span("router", "race", {
    wave: deps.wave,
    queued: deps.order.length,
    budgetMs: ASK_BUDGET_MS,
  });
  try {
    const outcome = await driveRace(deps);
    done(
      outcome.ok
        ? { ok: true, source: outcome.offer.label }
        : { ok: false, reason: outcome.reason, cooldownMs: outcome.cooldownMs },
    );
    return outcome;
  } catch (error) {
    done({ ok: false, reason: "threw", message: (error as Error)?.message });
    throw error;
  }
}

async function driveRace(deps: RaceDeps): Promise<RaceOutcome> {
  const now = deps.now ?? (() => Date.now());
  const iterator = asSettled(deps.order, deps.wave, async (sourceId) => {
    deps.onAsking?.(sourceId);
    return deps.ask(sourceId);
  });

  // One holder for everything the loop mutates, so arming and cancelling the
  // window happens in exactly one place rather than in whichever branch
  // happened to notice.
  const race: {
    state: RaceState;
    pending: Promise<IteratorResult<Settled<string, SourceOffer>>> | null;
    tick: { promise: Promise<Winner>; cancel: () => void } | null;
    attaching: Promise<Winner> | null;
    attachingOffer: SourceOffer | null;
    finished: boolean;
  } = {
    state: initialRaceState(now()),
    pending: null,
    tick: null,
    attaching: null,
    attachingOffer: null,
    finished: false,
  };

  try {
    for (;;) {
      const racers: Promise<Winner>[] = [];
      if (!race.finished) {
        race.pending ??= iterator.next();
        racers.push(
          race.pending.then((result): Winner => ({ kind: "settled", result })),
        );
      }
      if (race.tick) racers.push(race.tick.promise);
      if (race.attaching) racers.push(race.attaching);

      if (racers.length === 0) {
        return { ok: false, reason: "exhausted", cooldownMs: 10_000 };
      }

      const winner = await Promise.race(racers);
      let event: RouterEvent;

      switch (winner.kind) {
        case "attached":
          return race.attachingOffer
            ? { ok: true, offer: race.attachingOffer }
            : { ok: false, reason: "cancelled", cooldownMs: 0 };

        case "attachFailed":
          race.attaching = null;
          race.attachingOffer = null;
          event = { type: "attachFailed", sourceId: winner.sourceId };
          break;

        case "tick":
          race.tick?.cancel();
          race.tick = null;
          event = { type: "tick" };
          break;

        default: {
          race.pending = null;
          if (winner.result.done) {
            race.finished = true;
            event = { type: "exhausted" };
            break;
          }
          const settled = winner.result.value;
          if (settled.value) {
            deps.onOffer?.(settled.value);
            event = { type: "offer", offer: settled.value };
            break;
          }
          const error = settled.error;
          // Only the race's own signal means cancelled. An abort raised by a
          // deadline inside one source is that source failing, and treating it
          // as a cancel would end the race over one slow host.
          if (
            error instanceof DOMException &&
            error.name === "AbortError" &&
            deps.signal.aborted
          ) {
            return { ok: false, reason: "cancelled", cooldownMs: 0 };
          }
          const failure =
            error instanceof SourceFailure
              ? error
              : new SourceFailure(
                  (error as Error)?.message ?? "That source failed",
                  "unreachable",
                );
          deps.onFailure?.(settled.item, failure);
          event = {
            type: "failure",
            sourceId: settled.item,
            kind: failure.kind,
            retryAfterMs: failure.retryAfterMs,
          };
          break;
        }
      }

      const previouslyHeld = race.state.held;
      const at = now();
      const outcome = raceStep(race.state, event, at, deps.snapshot);
      race.state = outcome.state;

      // The reducer is where a race that will not move becomes visible: the
      // event that arrived, what it decided, and what it is still holding.
      debug("router", "step", {
        event: event.type,
        source:
          event.type === "offer"
            ? event.offer.label
            : event.type === "failure"
              ? event.sourceId
              : null,
        action: outcome.action.type,
        held: race.state.held?.label ?? null,
        attaching: race.state.attaching,
        graceInMs: Number.isFinite(race.state.graceUntil)
          ? Math.round(race.state.graceUntil - at)
          : null,
        exhausted: race.state.exhausted,
      });

      // The window belongs to whatever is currently held: armed when
      // something starts waiting, cancelled the moment nothing is.
      if (race.state.held && Number.isFinite(race.state.graceUntil)) {
        if (!race.tick) race.tick = armTick(race.state.graceUntil, now);
        if (race.state.held !== previouslyHeld) deps.onHolding?.(race.state.held);
      } else if (race.tick) {
        race.tick.cancel();
        race.tick = null;
      }

      if (outcome.action.type === "attach") {
        const offer = outcome.action.offer;
        race.attachingOffer = offer;
        deps.onAttaching?.(offer);
        race.attaching = deps.attach(offer).then(
          (): Winner => ({ kind: "attached" }),
          (): Winner => ({ kind: "attachFailed", sourceId: offer.sourceId }),
        );
      } else if (outcome.action.type === "stop") {
        return {
          ok: false,
          reason: outcome.action.reason,
          cooldownMs: outcome.action.cooldownMs,
        };
      }

      if (deps.signal.aborted) {
        return { ok: false, reason: "cancelled", cooldownMs: 0 };
      }
    }
  } finally {
    race.tick?.cancel();
    // Stops the generator scheduling anything else. Sources still in flight
    // are cut off by the caller's signal.
    void iterator.return(undefined).catch(() => {});
  }
}
