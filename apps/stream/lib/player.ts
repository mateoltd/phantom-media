"use client";

import Hls, { type ErrorData, type Events } from "hls.js";
import type { StreamCandidate } from "./types";

export interface QualityLevel {
  /** Index into the controller's own level list; -1 is automatic. */
  index: number;
  label: string;
  height: number;
  bitrate: number;
}

export interface QualityState {
  /** What was asked for: -1 when the stream picks for itself. */
  selected: number;
  /** What is actually playing right now. */
  effective: number;
}

export interface PlayerController {
  destroy(): void;
  /** Empty when the stream has no renditions to choose between. */
  levels: QualityLevel[];
  quality(): QualityState;
  setLevel(index: number): void;
  subscribeQuality(listener: (state: QualityState) => void): () => void;
}

export interface CandidateProbeResult {
  ranked: StreamCandidate[];
  verified: StreamCandidate[];
  failed: StreamCandidate[];
}

const NO_LEVELS: PlayerController["levels"] = [];

/**
 * How much a stream is worth before latency is considered. The difference
 * between 1080p and 480p is plain to see, and a stream half a second slower to
 * answer is not, so resolution decides first.
 *
 * A master playlist that declares no resolution of its own is the adaptive
 * case: it carries every rendition the source has, which is the best outcome
 * available, so it ranks just under a known 1080p.
 */
function qualityTier(candidate: StreamCandidate): number {
  const resolution = candidate.resolution ?? 0;
  if (resolution >= 1080) return 4;
  if (resolution === 0 && candidate.type === "hls") return 3;
  if (resolution >= 720) return 2;
  if (resolution > 0) return 1;
  return 0;
}

function staticQuality(destroy: () => void): PlayerController {
  return {
    destroy,
    levels: NO_LEVELS,
    quality: () => ({ selected: -1, effective: -1 }),
    setLevel: () => {},
    subscribeQuality: () => () => {},
  };
}

export async function probeCandidates(
  candidates: StreamCandidate[],
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CandidateProbeResult> {
  const timeoutMs = options.timeoutMs ?? 2_500;
  const outcomes = await Promise.all(
    candidates.map(async (candidate, index) => {
      if (candidate.type !== "hls") {
        return { candidate, index, latencyMs: Number.POSITIVE_INFINITY, ok: null };
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, timeoutMs);
      const startedAt = performance.now();

      try {
        const response = await fetch(candidate.url, {
          cache: "default",
          credentials: "omit",
          mode: "cors",
          signal: controller.signal,
        });
        const manifest = response.ok ? await response.text() : "";
        return {
          candidate,
          index,
          latencyMs: performance.now() - startedAt,
          ok: response.ok && manifest.trimStart().startsWith("#EXTM3U"),
        };
      } catch {
        return {
          candidate,
          index,
          latencyMs: performance.now() - startedAt,
          ok: false,
        };
      } finally {
        window.clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      }
    }),
  );

  if (options.signal?.aborted) {
    throw new DOMException("Source probing was aborted", "AbortError");
  }

  const verifiedOutcomes = outcomes
    .filter((outcome) => outcome.ok === true)
    .sort(
      (left, right) =>
        qualityTier(right.candidate) - qualityTier(left.candidate) ||
        left.latencyMs - right.latencyMs ||
        left.index - right.index,
    );
  const untested = outcomes
    .filter((outcome) => outcome.ok === null)
    .sort(
      (left, right) =>
        qualityTier(right.candidate) - qualityTier(left.candidate) ||
        left.index - right.index,
    );
  const failedOutcomes = outcomes.filter((outcome) => outcome.ok === false);

  return {
    ranked: [...verifiedOutcomes, ...untested, ...failedOutcomes].map(
      (outcome) => outcome.candidate,
    ),
    verified: verifiedOutcomes.map((outcome) => outcome.candidate),
    failed: failedOutcomes.map((outcome) => outcome.candidate),
  };
}

function waitForNativeMedia(
  video: HTMLVideoElement,
  timeoutMs: number,
  onFatal: (error: Error) => void,
): Promise<PlayerController> {
  return new Promise((resolve, reject) => {
    let ready = false;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The source did not respond in time"));
    }, timeoutMs);

    const onReady = () => {
      ready = true;
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      resolve(
        staticQuality(() => {
          cleanup();
          video.removeAttribute("src");
          video.load();
        }),
      );
    };
    const onError = () => {
      const error = new Error(
        video.error?.message || "The browser rejected this media source",
      );
      if (ready) onFatal(error);
      else {
        cleanup();
        reject(error);
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError);
  });
}

function levelLabel(height: number, bitrate: number): string {
  if (height > 0) return `${height}p`;
  if (bitrate > 0) return `${Math.round(bitrate / 1_000)} kbps`;
  return "Stream";
}

async function attachHls(
  video: HTMLVideoElement,
  url: string,
  timeoutMs: number,
  onFatal: (error: Error) => void,
): Promise<PlayerController> {
  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 60,
    maxBufferLength: 40,
    maxMaxBufferLength: 120,
    // These hosts are frequently slow rather than broken, and giving up on a
    // fragment too early is what turns a hitch into a failover.
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 2,
    levelLoadingMaxRetry: 3,
    // With no measurement yet, hls.js assumes a slow line and opens at the
    // bottom rendition, which is where "why is this 360p" comes from. Starting
    // from a realistic estimate opens at 1080p where the stream has it, and
    // the usual adaptation still drops it within a segment or two if the
    // connection cannot hold it.
    abrEwmaDefaultEstimate: 3_000_000,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The manifest did not respond in time"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      hls.off(Hls.Events.MANIFEST_PARSED, onReady);
      hls.off(Hls.Events.ERROR, onStartupError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onStartupError = (_event: Events.ERROR, data: ErrorData) => {
      if (!data.fatal) return;
      cleanup();
      reject(new Error(data.details || "The stream failed to start"));
    };

    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, onStartupError);
    hls.loadSource(url);
    hls.attachMedia(video);
  }).catch((error) => {
    hls.destroy();
    throw error;
  });

  const levels: QualityLevel[] = hls.levels.map((level, index) => ({
    index,
    label: levelLabel(level.height ?? 0, level.bitrate ?? 0),
    height: level.height ?? 0,
    bitrate: level.bitrate ?? 0,
  }));

  const listeners = new Set<(state: QualityState) => void>();
  const quality = (): QualityState => ({
    selected: hls.autoLevelEnabled ? -1 : hls.currentLevel,
    effective: hls.currentLevel,
  });
  const publish = () => {
    const state = quality();
    for (const listener of listeners) listener(state);
  };

  // A fatal error mid-play is usually one bad fragment or a dropped socket,
  // both of which hls.js can come back from. Only a second failure of the same
  // kind means the source is really gone and another one should be tried.
  let recoveredNetwork = false;
  let recoveredMedia = false;
  const onError = (_event: Events.ERROR, data: ErrorData) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !recoveredNetwork) {
      recoveredNetwork = true;
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
      recoveredMedia = true;
      hls.recoverMediaError();
      return;
    }
    onFatal(new Error(data.details || "The stream stopped"));
  };

  hls.on(Hls.Events.ERROR, onError);
  hls.on(Hls.Events.LEVEL_SWITCHED, publish);

  return {
    destroy: () => hls.destroy(),
    levels,
    quality,
    setLevel: (index: number) => {
      hls.currentLevel = index;
      // `nextLevel` makes the switch take effect at the next fragment instead
      // of stalling on a flush, which is what a manual pick should feel like.
      if (index >= 0) hls.nextLevel = index;
      publish();
    },
    subscribeQuality: (listener) => {
      listeners.add(listener);
      listener(quality());
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export async function attachCandidate(
  video: HTMLVideoElement,
  candidate: StreamCandidate,
  options: {
    timeoutMs?: number;
    onFatal: (error: Error) => void;
  },
): Promise<PlayerController> {
  const timeoutMs = options.timeoutMs ?? 5_000;

  if (candidate.type === "hls") {
    // hls.js gives a quality menu and error recovery, so it is preferred even
    // where the browser could play the manifest itself.
    if (Hls.isSupported()) {
      return attachHls(video, candidate.url, timeoutMs, options.onFatal);
    }
    if (!video.canPlayType("application/vnd.apple.mpegurl")) {
      throw new Error("This browser cannot play HLS streams");
    }
  }

  const pending = waitForNativeMedia(video, timeoutMs, options.onFatal);
  video.src = candidate.url;
  video.load();
  return pending;
}
