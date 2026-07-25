"use client";

import Hls, { type ErrorData, type Events } from "hls.js";
import { asSettled } from "./concurrent";
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

export interface CandidateProbe {
  candidate: StreamCandidate;
  /** True when a manifest answered, false when it did not, null when unprobed. */
  ok: boolean | null;
  latencyMs: number;
  tier: number;
}

export interface CandidateProbeResult {
  ranked: StreamCandidate[];
  verified: StreamCandidate[];
  failed: StreamCandidate[];
  outcomes: CandidateProbe[];
  /** Best tier among candidates that actually answered, 0 when none did. */
  verifiedTier: number;
  /** How long the candidate that ranked first took, or null if none verified. */
  probeMs: number | null;
}

const NO_LEVELS: PlayerController["levels"] = [];

/**
 * How many manifests are fetched at once, and how many are worth fetching.
 *
 * Probing every variant of every source in parallel was itself part of what
 * made finding a stream slow: five sources returning twenty variants each is
 * a hundred simultaneous cross-origin requests against a browser that will
 * only open six per host. The top few by resolution contain the answer in
 * every case that matters.
 */
const PROBE_CONCURRENCY = 4;
const MAX_PROBE_CANDIDATES = 6;

/** Enough to see whether a playlist starts the way a playlist must. */
const MANIFEST_HEAD_BYTES = 256;

/**
 * How much a stream is worth before latency is considered. The difference
 * between 1080p and 480p is plain to see, and a stream half a second slower to
 * answer is not, so resolution decides first.
 *
 * A master playlist that declares no resolution of its own is the adaptive
 * case: it carries every rendition the source has, which is the best outcome
 * available, so it ranks just under a known 1080p.
 */
export function qualityTier(candidate: StreamCandidate): number {
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

/**
 * Reads just enough of a response to tell a playlist from anything else.
 *
 * A `Range` header would look like the cheaper way to do this, and it is a
 * trap: it is not a safelisted request header, so asking for one turns every
 * probe into a preflighted request — an extra round trip per candidate, and an
 * outright failure against any host that does not answer OPTIONS. A HEAD is
 * worse still, since these hosts commonly answer it with 405 and the body is
 * the only thing that can be checked anyway. Capping the read is the version
 * of the idea that costs nothing.
 */
async function readManifestHead(response: Response): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, MANIFEST_HEAD_BYTES);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let head = "";
  try {
    while (head.length < MANIFEST_HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      head += decoder.decode(value, { stream: true });
    }
  } finally {
    // The rest of the playlist is hls.js's business, not ours.
    await reader.cancel().catch(() => {});
  }
  return head;
}

async function probeOne(
  candidate: StreamCandidate,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<CandidateProbe> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(candidate.url, {
      cache: "default",
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    });
    const head = response.ok ? await readManifestHead(response) : "";
    return {
      candidate,
      ok: response.ok && head.trimStart().startsWith("#EXTM3U"),
      latencyMs: performance.now() - startedAt,
      tier: qualityTier(candidate),
    };
  } catch {
    return {
      candidate,
      ok: false,
      latencyMs: performance.now() - startedAt,
      tier: qualityTier(candidate),
    };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function probeCandidates(
  candidates: StreamCandidate[],
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CandidateProbeResult> {
  const timeoutMs = options.timeoutMs ?? 2_500;
  const order = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  const position = (candidate: StreamCandidate) => order.get(candidate.id) ?? 0;
  const byTier = (left: StreamCandidate, right: StreamCandidate) =>
    qualityTier(right) - qualityTier(left) || position(left) - position(right);

  // Only manifests can be checked without committing the video element to
  // them, and only the best few are worth checking.
  const probeable = candidates
    .filter((candidate) => candidate.type === "hls")
    .sort(byTier)
    .slice(0, MAX_PROBE_CANDIDATES);
  const probeableIds = new Set(probeable.map((candidate) => candidate.id));

  const probed: CandidateProbe[] = [];
  for await (const settled of asSettled(probeable, PROBE_CONCURRENCY, (candidate) =>
    probeOne(candidate, timeoutMs, options.signal),
  )) {
    if (settled.value) probed.push(settled.value);
  }

  if (options.signal?.aborted) {
    throw new DOMException("Source probing was aborted", "AbortError");
  }

  const unprobed: CandidateProbe[] = candidates
    .filter((candidate) => !probeableIds.has(candidate.id))
    .map((candidate) => ({
      candidate,
      ok: null,
      latencyMs: Number.POSITIVE_INFINITY,
      tier: qualityTier(candidate),
    }));

  const verifiedOutcomes = probed
    .filter((outcome) => outcome.ok === true)
    .sort(
      (left, right) =>
        right.tier - left.tier ||
        left.latencyMs - right.latencyMs ||
        position(left.candidate) - position(right.candidate),
    );
  const untested = unprobed.sort(
    (left, right) =>
      right.tier - left.tier ||
      position(left.candidate) - position(right.candidate),
  );
  const failedOutcomes = probed.filter((outcome) => outcome.ok === false);

  return {
    ranked: [...verifiedOutcomes, ...untested, ...failedOutcomes].map(
      (outcome) => outcome.candidate,
    ),
    verified: verifiedOutcomes.map((outcome) => outcome.candidate),
    failed: failedOutcomes.map((outcome) => outcome.candidate),
    outcomes: [...verifiedOutcomes, ...untested, ...failedOutcomes],
    verifiedTier: verifiedOutcomes[0]?.tier ?? 0,
    probeMs: verifiedOutcomes.length > 0 ? verifiedOutcomes[0]!.latencyMs : null,
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
