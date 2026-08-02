"use client";

import type { Settled } from "./concurrent";
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
import { asSettledByFailureDomain } from "../src/failure-domain.mjs";
import {
  UNVERIFIED_AUDIO_LANGUAGE,
  normalizeAudioLanguage,
} from "../src/media-language.mjs";
import {
  unverifiedFallbackPlaybackPreference,
  unverifiedFallbackPreference,
} from "../src/source-observations.mjs";

export const RESOLVE_TIMEOUT_MS = 11_000;

export const PROBE_TIMEOUT_MS = 4_000;

export const ASK_BUDGET_MS = RESOLVE_TIMEOUT_MS + PROBE_TIMEOUT_MS + 200;

export const STARTUP_TIMEOUT_MS = 5_000;
export const PINNED_STARTUP_TIMEOUT_MS = 6_000;

export const MAX_ATTEMPTS_PER_SOURCE = 2;

export class SourceFailure extends Error {
  kind: FailureKind;
  retryAfterMs: number | null;
  status: number;
  retryable: boolean;
  languageMismatch: boolean;
  languageUnknown: boolean;
  availableAudioLanguages: readonly string[];

  constructor(
    message: string,
    kind: FailureKind,
    options: {
      status?: number;
      retryAfterMs?: number | null;
      retryable?: boolean;
      languageMismatch?: boolean;
      languageUnknown?: boolean;
      availableAudioLanguages?: readonly string[];
    } = {},
  ) {
    super(message);
    this.name = "SourceFailure";
    this.kind = kind;
    this.status = options.status ?? 0;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryable = options.retryable ?? kind === "unreachable";
    this.languageMismatch = options.languageMismatch ?? false;
    this.languageUnknown = options.languageUnknown ?? false;
    this.availableAudioLanguages = options.availableAudioLanguages ?? [];
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
  preferredAudioLanguage: string;
  fresh?: boolean;
  traceId?: string;
}

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
    audioLanguage: normalizeAudioLanguage(context.preferredAudioLanguage),
  });
  if (context.media.imdbId) params.set("imdbId", context.media.imdbId);
  if (context.fresh) params.set("fresh", "1");
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
      headers: debugRequestHeaders(context.traceId),
    });
    debug("source", "http", {
      source: label,
      status: response.status,
      ms: performance.now() - startedAt,
      server: readServerTiming(response),
    });
    payload = (await response.json()) as ResolverResponse & ResolverFailureBody;
  } catch (error) {
    if (context.signal.aborted) {
      done({ outcome: "abandoned", source: label });
      throw error;
    }
    done({ outcome: "timeout", source: label });
    throw new SourceFailure(`${label} was too slow this time`, "slow", {
      retryable: false,
    });
  } finally {
    window.clearTimeout(timeout);
    context.signal.removeEventListener("abort", abort);
  }

  if (!response.ok) {
    const timedOut =
      response.status === 504 ||
      /(?:timed? ?out|timeout|aborted due to timeout)/i.test(
        payload.error ?? "",
      );
    const limited =
      response.status === 429 || (Boolean(payload.retryable) && !payload.server);
    done({
      outcome: timedOut ? "slow" : limited ? "limited" : "unreachable",
      source: label,
      status: response.status,
      retryAfterMs: payload.retryAfterMs ?? null,
    });
    throw new SourceFailure(
      payload.error || `${label} returned HTTP ${response.status}`,
      timedOut ? "slow" : limited ? "limited" : "unreachable",
      {
        status: response.status,
        retryAfterMs: payload.retryAfterMs ?? null,
        retryable: payload.retryable ?? false,
      },
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
      preferredAudioLanguage: context.preferredAudioLanguage,
    });
  } catch (error) {
    done({ outcome: "abandoned", source: label });
    throw error;
  }
  const availableAudioLanguages = [
    ...new Set(
      probe.outcomes
        .filter((outcome) => outcome.ok === true)
        .flatMap((outcome) => outcome.audioLanguages),
    ),
  ];
  if (
    availableAudioLanguages.length === 0 &&
    probe.unverified.length > 0
  ) {
    availableAudioLanguages.push(UNVERIFIED_AUDIO_LANGUAGE);
  }
  debug("source", "probed", {
    source: label,
    offered: payload.candidates.length,
    verified: probe.verified.length,
    failed: probe.failed.length,
    languageRejected: probe.languageRejected.length,
    availableAudioLanguages,
    tier: probe.verifiedTier || probe.unverifiedTier,
    ms: performance.now() - startedAt - resolveMs,
  });

  const attempts = (
    probe.verified.length > 0
      ? probe.verified
      : probe.unverified.length > 0
        ? probe.unverified
      : probe.ranked.filter((candidate) => candidate.type !== "hls")
  ).slice(0, MAX_ATTEMPTS_PER_SOURCE);

  if (attempts.length === 0) {
    const languageMismatch = probe.languageRejected.length > 0;
    const rejectedLanguageOutcomes = probe.outcomes.filter(
      (outcome) => !outcome.languageMatch,
    );
    const languageUnknown =
      rejectedLanguageOutcomes.length > 0 &&
      rejectedLanguageOutcomes.every(
        (outcome) => outcome.audioLanguages.length === 0,
      );
    const unplayable = !languageMismatch && payload.candidates.length > 0;
    done({
      outcome: languageMismatch
        ? languageUnknown
          ? "language-unknown"
          : "language-mismatch"
        : "unplayable",
      source: label,
      resolveMs,
    });
    throw new SourceFailure(
      languageMismatch
        ? languageUnknown
          ? "The stream did not declare its audio language"
          : "No stream matched the selected audio language"
        : "The source offered stream links, but none were playable",
      unplayable ? "unplayable" : "empty",
      {
        languageMismatch,
        languageUnknown,
        availableAudioLanguages,
      },
    );
  }

  const prefersUnverified =
    normalizeAudioLanguage(context.preferredAudioLanguage) ===
    UNVERIFIED_AUDIO_LANGUAGE;
  const audioVerified = !prefersUnverified && probe.verified.length > 0;
  const audioFallback = !prefersUnverified && !audioVerified;
  const fallbackPreference = audioFallback
    ? unverifiedFallbackPreference(
        attempts[0],
        context.preferredAudioLanguage,
      )
    : undefined;
  const fallbackPlaybackPreference = audioFallback
    ? unverifiedFallbackPlaybackPreference(attempts[0])
    : undefined;
  const manifestVerified =
    probe.verified.length > 0 || probe.unverified.length > 0;
  const verifiedTier = probe.verifiedTier || probe.unverifiedTier;

  done({
    outcome: "offer",
    source: label,
    resolveMs,
    verified: manifestVerified,
    audioVerified,
    audioFallback,
    fallbackPreference,
    fallbackPlaybackPreference,
    tier: verifiedTier,
    attempts: attempts.length,
  });

  return {
    sourceId,
    label,
    verified: manifestVerified,
    audioVerified,
    audioFallback,
    fallbackPreference,
    fallbackPlaybackPreference,
    verifiedTier,
    totalMs: performance.now() - startedAt,
    ranked: probe.ranked,
    attempts,
    subtitles: payload.subtitles ?? [],
    availableAudioLanguages,
    resolveMs,
    probeMs: probe.probeMs,
  };
}

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
  const iterator = asSettledByFailureDomain(
    deps.order,
    deps.wave,
    async (sourceId) => {
      deps.onAsking?.(sourceId);
      return deps.ask(sourceId);
    },
  );

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
          if (deps.signal.aborted) {
            return { ok: false, reason: "cancelled", cooldownMs: 0 };
          }
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
    void iterator.return(undefined).catch(() => {});
  }
}
