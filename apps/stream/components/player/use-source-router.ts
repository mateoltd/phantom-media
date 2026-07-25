"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_WAVE,
  SOURCE_COOLDOWN_MS,
  describeSource,
  nextWaveSize,
  orderSources,
  type ScoreSnapshot,
  type SourceOffer,
} from "@/src/router-policy.mjs";
import { attachCandidate, type PlayerController, type QualityLevel, type QualityState } from "@/lib/player";
import {
  PINNED_STARTUP_TIMEOUT_MS,
  STARTUP_TIMEOUT_MS,
  SourceFailure,
  askSource,
  runRace,
} from "@/lib/source-router";
import { readScores, recordObservation, titleKey } from "@/lib/source-score";
import { formatTimecode } from "@/lib/media";
import { progressKey, readResumePoint, resumableTime } from "@/lib/resume";
import type {
  MediaResult,
  StreamCandidate,
  SubtitleTrack,
} from "@/lib/types";

export interface SourceEntry {
  id: string;
  label: string;
}

export type SourceStatus =
  | "idle"
  | "queued"
  | "asking"
  | "offered"
  | "holding"
  | "playing"
  | "empty"
  | "unreachable"
  | "limited";

export interface SourceProgress {
  id: string;
  label: string;
  status: SourceStatus;
  /** What the score store already knew, so the roster is useful on arrival. */
  reputation: string;
  elapsedMs: number | null;
  bestLabel: string | null;
}

export type RouterPhase =
  | "idle"
  | "racing"
  | "holding"
  | "attaching"
  | "playing"
  | "cooldown"
  | "error";

export interface RouterState {
  phase: RouterPhase;
  statusText: string;
  activeSource: string | null;
  activeCandidate: StreamCandidate | null;
  candidates: readonly StreamCandidate[];
  subtitles: readonly SubtitleTrack[];
  levels: readonly QualityLevel[];
  quality: QualityState;
  progress: readonly SourceProgress[];
  answered: number;
  total: number;
  raceElapsedMs: number;
  retryAt: number;
  /** Counted down by the cooldown ticker, not read from the clock on render. */
  retrySeconds: number;
  pinned: string | null;
  /** Where playback picked up, so the page can offer to start over. */
  resumedFrom: number | null;
}

/** A fatal error this soon after attaching means the source, not the network. */
const STALL_WINDOW_MS = 30_000;

/** Fast enough to feel live, slow enough that fourteen sources are not
 *  fourteen renders. */
const FLUSH_INTERVAL_MS = 150;

interface Pending {
  resolveMs: number;
  probeMs: number | null;
  tier: number;
  startedAt: number;
}

function initialState(total: number): RouterState {
  return {
    phase: "idle",
    statusText: "",
    activeSource: null,
    activeCandidate: null,
    candidates: [],
    subtitles: [],
    levels: [],
    quality: { selected: -1, effective: -1 },
    progress: [],
    answered: 0,
    total,
    raceElapsedMs: 0,
    retryAt: 0,
    retrySeconds: 0,
    pinned: null,
    resumedFrom: null,
  };
}

export interface UseSourceRouterOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  media: MediaResult;
  season: number;
  episode: number;
  sources: readonly SourceEntry[];
}

/**
 * Finds something to play and keeps it playing.
 *
 * All the judgement is in `src/router-policy.mjs` and all the plumbing is in
 * `lib/source-router.ts`; this holds the mutable pieces React is bad at — the
 * attached controller, the request generation, what each source is doing right
 * now — and publishes a snapshot of them at a rate a person can read.
 */
export function useSourceRouter({
  videoRef,
  media,
  season,
  episode,
  sources,
}: UseSourceRouterOptions) {
  const [state, setState] = useState<RouterState>(() =>
    initialState(sources.length),
  );

  const controllerRef = useRef<PlayerController | null>(null);
  const unsubscribeQualityRef = useRef<(() => void) | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const startRef = useRef<(options?: { pin?: string | null }) => void>(() => {});

  /** Per-tab, so a host that is down is not re-asked on every episode. */
  const coolingRef = useRef<Record<string, number>>({});
  const waveRef = useRef(MAX_WAVE);
  const pinnedRef = useRef<string | null>(null);
  const pinRetriedRef = useRef(false);
  const attachedAtRef = useRef(0);
  const attachedSourceRef = useRef<string | null>(null);
  const pendingRef = useRef<Record<string, Pending>>({});
  const progressRef = useRef<Record<string, SourceProgress>>({});
  const raceStartedAtRef = useRef(0);
  const dirtyRef = useRef(false);

  const playable = media.tmdbId !== null;
  const resumeKey = progressKey(media, season, episode);
  const currentTitleKey = titleKey(media, season);

  const labelOf = useCallback(
    (id: string) => sources.find((entry) => entry.id === id)?.label ?? id,
    [sources],
  );

  /* ---------------------------------------------------------------- state */

  const patch = useCallback((next: Partial<RouterState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  const setProgress = useCallback(
    (id: string, next: Partial<SourceProgress>) => {
      const existing = progressRef.current[id];
      if (!existing) return;
      progressRef.current[id] = { ...existing, ...next };
      dirtyRef.current = true;
    },
    [],
  );

  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const progress = Object.values(progressRef.current);
    setState((current) => ({
      ...current,
      progress,
      answered: progress.filter(
        (entry) =>
          entry.status !== "idle" &&
          entry.status !== "queued" &&
          entry.status !== "asking",
      ).length,
      raceElapsedMs: raceStartedAtRef.current
        ? Date.now() - raceStartedAtRef.current
        : 0,
    }));
  }, []);

  /* ----------------------------------------------------------- controller */

  const detach = useCallback(() => {
    unsubscribeQualityRef.current?.();
    unsubscribeQualityRef.current = null;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    patch({ levels: [], quality: { selected: -1, effective: -1 } });
  }, [patch]);

  const adopt = useCallback(
    (controller: PlayerController) => {
      controllerRef.current = controller;
      unsubscribeQualityRef.current = controller.subscribeQuality((quality) =>
        patch({ quality }),
      );
      patch({ levels: controller.levels });
    },
    [patch],
  );

  /* --------------------------------------------------------- observations */

  const record = useCallback(
    (
      sourceId: string,
      outcome: "verified" | "empty" | "unreachable" | "limited",
      extra: { attached?: boolean; ttffMs?: number | null; stalled?: boolean } = {},
    ) => {
      const pending = pendingRef.current[sourceId];
      recordObservation({
        sourceId,
        titleKey: currentTitleKey,
        outcome,
        resolveMs: pending?.resolveMs ?? 0,
        probeMs: pending?.probeMs ?? null,
        tier: pending?.tier ?? 0,
        attached: extra.attached ?? false,
        ttffMs: extra.ttffMs ?? null,
        stalled: extra.stalled ?? false,
      });
    },
    [currentTitleKey],
  );

  /* -------------------------------------------------------------- attach */

  const attachOne = useCallback(
    async (
      candidate: StreamCandidate,
      sourceId: string,
      requestId: number,
      resumeFrom: number | null,
      timeoutMs: number,
    ) => {
      const video = videoRef.current;
      if (!video) throw new Error("The player is not mounted");

      detach();
      const startedAt = performance.now();

      const controller = await attachCandidate(video, candidate, {
        timeoutMs,
        onFatal: () => {
          if (requestIdRef.current !== requestId) return;
          const stalled = Date.now() - attachedAtRef.current < STALL_WINDOW_MS;
          record(sourceId, "verified", { attached: true, stalled });
          // A source that dies is not a source to keep, but a pinned one gets
          // one more go before the viewer's choice is second-guessed: its
          // upstream answer is still cached, so this costs almost nothing.
          if (pinnedRef.current === sourceId && !pinRetriedRef.current) {
            pinRetriedRef.current = true;
            patch({ statusText: `${labelOf(sourceId)} dropped out. Reconnecting` });
            startRef.current({ pin: sourceId });
            return;
          }
          if (pinnedRef.current === sourceId) {
            patch({
              phase: "error",
              statusText: `${labelOf(sourceId)} keeps dropping out. Try another source, or switch back to automatic.`,
            });
            return;
          }
          coolingRef.current[sourceId] = Date.now() + SOURCE_COOLDOWN_MS;
          patch({ statusText: "That source stopped. Finding another" });
          startRef.current();
        },
      });

      if (requestIdRef.current !== requestId) {
        controller.destroy();
        throw new Error("superseded");
      }

      adopt(controller);
      attachedAtRef.current = Date.now();
      attachedSourceRef.current = sourceId;
      record(sourceId, "verified", {
        attached: true,
        ttffMs: performance.now() - startedAt,
      });

      if (resumeFrom !== null) {
        seekWhenReady(video, resumeFrom);
      }
      try {
        await video.play();
      } catch {
        // Autoplay is commonly refused after an async source swap. The centre
        // control and the spacebar both still work.
      }
      return controller;
    },
    [adopt, detach, labelOf, patch, record, videoRef],
  );

  /* --------------------------------------------------------------- start */

  const start = useCallback(
    async (options: { pin?: string | null } = {}) => {
      if (!videoRef.current || !playable) return;

      if (options.pin !== undefined) {
        pinnedRef.current = options.pin;
        pinRetriedRef.current = false;
      }
      const pinned = pinnedRef.current;

      const requestId = ++requestIdRef.current;
      fetchControllerRef.current?.abort();
      const fetchController = new AbortController();
      fetchControllerRef.current = fetchController;
      detach();

      const snapshot: ScoreSnapshot = readScores(currentTitleKey);
      const order = orderSources(
        sources.map((entry) => entry.id),
        snapshot,
        { pinned, cooling: coolingRef.current, now: Date.now() },
      );
      const wave = pinned ? 1 : waveRef.current;

      raceStartedAtRef.current = Date.now();
      pendingRef.current = {};
      progressRef.current = Object.fromEntries(
        sources.map((entry) => [
          entry.id,
          {
            id: entry.id,
            label: entry.label,
            status: order.includes(entry.id)
              ? ("queued" as SourceStatus)
              : ("idle" as SourceStatus),
            reputation: describeSource(snapshot, entry.id),
            elapsedMs: null,
            bestLabel: null,
          },
        ]),
      );
      dirtyRef.current = true;

      const resumeFrom = resumableTime(readResumePoint(resumeKey));
      setState((current) => ({
        ...current,
        phase: "racing",
        statusText: pinned
          ? `Asking ${labelOf(pinned)}`
          : `Looking for a source`,
        activeSource: null,
        activeCandidate: null,
        candidates: [],
        subtitles: [],
        progress: Object.values(progressRef.current),
        answered: 0,
        total: sources.length,
        raceElapsedMs: 0,
        pinned,
        resumedFrom: resumeFrom,
      }));

      const outcome = await runRace({
        order,
        wave,
        snapshot,
        signal: fetchController.signal,
        ask: (sourceId) =>
          askSource(sourceId, {
            media,
            season,
            episode,
            label: labelOf,
            signal: fetchController.signal,
          }),
        onAsking: (sourceId) => {
          setProgress(sourceId, { status: "asking" });
        },
        onOffer: (offer) => {
          pendingRef.current[offer.sourceId] = {
            resolveMs: offer.resolveMs,
            probeMs: offer.probeMs,
            tier: offer.verifiedTier,
            startedAt: Date.now(),
          };
          setProgress(offer.sourceId, {
            status: "offered",
            elapsedMs: Math.round(offer.totalMs),
            bestLabel: tierLabel(offer),
          });
          patch({ candidates: offer.ranked, subtitles: offer.subtitles });
        },
        onHolding: (offer) => {
          setProgress(offer.sourceId, { status: "holding" });
          patch({
            phase: "holding",
            // The window is where this is most likely to feel like a stall, so
            // it is where it most needs to say what it is doing.
            statusText: `Found ${tierLabel(offer) ?? "a stream"} on ${offer.label}. Checking for better`,
          });
        },
        onAttaching: (offer) => {
          patch({ phase: "attaching", statusText: `Connecting to ${offer.label}` });
        },
        onFailure: (sourceId, failure) => {
          setProgress(sourceId, { status: failure.kind });
          record(sourceId, failure.kind);
          if (failure.kind === "unreachable") {
            coolingRef.current[sourceId] = Date.now() + SOURCE_COOLDOWN_MS;
          }
        },
        attach: async (offer) => {
          const timeoutMs = pinned
            ? PINNED_STARTUP_TIMEOUT_MS
            : STARTUP_TIMEOUT_MS;
          for (const candidate of offer.attempts) {
            try {
              await attachOne(
                candidate,
                offer.sourceId,
                requestId,
                resumeFrom,
                timeoutMs,
              );
              if (requestIdRef.current !== requestId) throw new Error("superseded");
              setProgress(offer.sourceId, { status: "playing" });
              patch({
                phase: "playing",
                activeSource: offer.sourceId,
                activeCandidate: candidate,
                candidates: offer.ranked,
                subtitles: offer.subtitles,
                retryAt: 0,
                statusText:
                  resumeFrom !== null
                    ? `Resumed at ${formatTimecode(resumeFrom)}, playing from ${offer.label}`
                    : `Playing from ${offer.label}`,
              });
              return;
            } catch (error) {
              if ((error as Error).message === "superseded") throw error;
            }
          }
          setProgress(offer.sourceId, { status: "unreachable" });
          coolingRef.current[offer.sourceId] = Date.now() + SOURCE_COOLDOWN_MS;
          throw new Error(`${offer.label} would not start`);
        },
      });

      if (requestIdRef.current !== requestId) return;

      if (outcome.ok) {
        waveRef.current = nextWaveSize(waveRef.current, false);
        fetchController.abort();
        fetchControllerRef.current = null;
        flush();
        return;
      }
      if (outcome.reason === "cancelled") return;

      waveRef.current = nextWaveSize(
        waveRef.current,
        outcome.reason === "rateLimited",
      );
      const cooldownMs = outcome.cooldownMs;
      setState((current) => ({
        ...current,
        phase: pinned ? "error" : "cooldown",
        activeSource: null,
        retryAt: cooldownMs > 0 ? Date.now() + cooldownMs : 0,
        retrySeconds: Math.ceil(cooldownMs / 1_000),
        progress: Object.values(progressRef.current),
        statusText: pinned
          ? `${labelOf(pinned)} has nothing for this. Pick another source, or switch back to automatic.`
          : outcome.reason === "rateLimited"
            ? `Upstream is rate limiting. Retrying in ${Math.ceil(cooldownMs / 1_000)}s`
            : `No source could play this. Retrying in ${Math.ceil(cooldownMs / 1_000)}s`,
      }));
    },
    [
      attachOne,
      currentTitleKey,
      detach,
      episode,
      flush,
      labelOf,
      media,
      patch,
      playable,
      record,
      resumeKey,
      season,
      setProgress,
      sources,
      videoRef,
    ],
  );

  useEffect(() => {
    startRef.current = (options) => void start(options);
  }, [start]);

  /* -------------------------------------------------------------- effects */

  // Arriving on the page is the request to play. Making that a second click
  // was the slowest part of getting to a picture.
  const autoStartedRef = useRef("");
  useEffect(() => {
    const key = `${media.id}:${season}:${episode}`;
    if (autoStartedRef.current === key || !playable) return;
    autoStartedRef.current = key;
    pinnedRef.current = null;
    startRef.current({ pin: null });
  }, [episode, media.id, playable, season]);

  useEffect(() => {
    const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flush]);

  // The cooldown counts itself down so the button can say how long is left.
  const retryAt = state.retryAt;
  useEffect(() => {
    if (retryAt <= 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
      setState((current) =>
        current.retryAt !== retryAt
          ? current
          : left > 0
            ? { ...current, retrySeconds: left }
            : {
                ...current,
                retryAt: 0,
                retrySeconds: 0,
                statusText: "Ready to try again",
              },
      );
    };
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      fetchControllerRef.current?.abort();
      unsubscribeQualityRef.current?.();
      controllerRef.current?.destroy();
    },
    [],
  );

  /* -------------------------------------------------------------- actions */

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = null;
    detach();
    attachedSourceRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    progressRef.current = {};
    setState(initialState(sources.length));
  }, [detach, sources.length, videoRef]);

  const pin = useCallback((sourceId: string) => {
    startRef.current({ pin: sourceId });
  }, []);

  const unpin = useCallback(() => {
    startRef.current({ pin: null });
  }, []);

  const retry = useCallback(() => {
    startRef.current();
  }, []);

  const setQualityLevel = useCallback((index: number) => {
    controllerRef.current?.setLevel(index);
  }, []);

  const selectCandidate = useCallback(
    (candidateId: string) => {
      const candidate = state.candidates.find((item) => item.id === candidateId);
      const sourceId = state.activeSource;
      if (!candidate || !sourceId) return;
      // A different stream of the same title should not restart it.
      const resumeFrom = videoRef.current?.currentTime ?? 0;
      const requestId = ++requestIdRef.current;
      attachOne(
        candidate,
        sourceId,
        requestId,
        resumeFrom || null,
        STARTUP_TIMEOUT_MS,
      )
        .then(() => {
          patch({ activeCandidate: candidate });
        })
        .catch((error: Error) => {
          if (error.message === "superseded") return;
          patch({ phase: "error", statusText: error.message });
        });
    },
    [attachOne, patch, state.activeSource, state.candidates, videoRef],
  );

  const retrySeconds = state.retrySeconds;

  const canStart =
    playable &&
    retrySeconds === 0 &&
    state.phase !== "racing" &&
    state.phase !== "holding" &&
    state.phase !== "attaching";

  return useMemo(
    () => ({
      state,
      retrySeconds,
      canStart,
      start: retry,
      pin,
      unpin,
      cancel,
      selectCandidate,
      setQualityLevel,
    }),
    [
      cancel,
      canStart,
      pin,
      retry,
      retrySeconds,
      selectCandidate,
      setQualityLevel,
      state,
      unpin,
    ],
  );
}

/** A manifest can report its duration a beat after it starts loading. */
function seekWhenReady(video: HTMLVideoElement, seconds: number): void {
  if (video.readyState >= 1) {
    video.currentTime = seconds;
    return;
  }
  video.addEventListener(
    "loadedmetadata",
    () => {
      video.currentTime = seconds;
    },
    { once: true },
  );
}

function tierLabel(offer: SourceOffer): string | null {
  switch (offer.verifiedTier) {
    case 4:
      return "1080p or better";
    case 3:
      return "adaptive";
    case 2:
      return "720p";
    case 1:
      return "low quality";
    default:
      return null;
  }
}
