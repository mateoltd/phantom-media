"use client";

import Hls from "hls.js";
import type { StreamCandidate } from "./types";

export interface PlayerController {
  destroy(): void;
}

export interface CandidateProbeResult {
  ranked: StreamCandidate[];
  verified: StreamCandidate[];
  failed: StreamCandidate[];
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
        left.latencyMs - right.latencyMs || left.index - right.index,
    );
  const untested = outcomes.filter((outcome) => outcome.ok === null);
  const failedOutcomes = outcomes.filter((outcome) => outcome.ok === false);

  return {
    ranked: [
      ...verifiedOutcomes,
      ...untested,
      ...failedOutcomes,
    ].map((outcome) => outcome.candidate),
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
      resolve({
        destroy() {
          cleanup();
          video.removeAttribute("src");
          video.load();
        },
      });
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
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const pending = waitForNativeMedia(video, timeoutMs, options.onFatal);
      video.src = candidate.url;
      video.load();
      return pending;
    }

    if (!Hls.isSupported()) {
      throw new Error("This browser cannot play HLS streams");
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 60,
      maxBufferLength: 30,
    });

    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("The HLS manifest did not respond in time"));
      }, timeoutMs);

      const cleanup = () => {
        window.clearTimeout(timeout);
        hls.off(Hls.Events.MANIFEST_PARSED, onReady);
        if (!ready) hls.off(Hls.Events.ERROR, onError);
      };
      const onReady = () => {
        ready = true;
        cleanup();
        resolve();
      };
      const onError = (_event: string, data: { fatal?: boolean; details?: string }) => {
        if (!data.fatal) return;
        const error = new Error(data.details || "Fatal HLS playback error");
        if (ready) options.onFatal(error);
        else {
          cleanup();
          reject(error);
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, onReady);
      hls.on(Hls.Events.ERROR, onError);
      hls.loadSource(candidate.url);
      hls.attachMedia(video);
    }).catch((error) => {
      hls.destroy();
      throw error;
    });

    return { destroy: () => hls.destroy() };
  }

  const pending = waitForNativeMedia(video, timeoutMs, options.onFatal);
  video.src = candidate.url;
  video.load();
  return pending;
}
