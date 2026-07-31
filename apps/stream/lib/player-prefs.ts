"use client";

import { normalizeAudioLanguage } from "../src/media-language.mjs";

const STORAGE_KEY = "phantom.stream.prefs";
const VERSION = 1;

export type CaptionSize = "small" | "medium" | "large";

export interface PlayerPrefs {
  version: number;
  volume: number;
  muted: boolean;
  audioLanguage: string | null;
  captionLanguage: string | null;
  captionSize: CaptionSize;
  captionBackdrop: boolean;
  playbackRate: number;
}

export const DEFAULT_PREFS: PlayerPrefs = {
  version: VERSION,
  volume: 1,
  muted: false,
  audioLanguage: null,
  captionLanguage: null,
  captionSize: "medium",
  captionBackdrop: true,
  playbackRate: 1,
};

function clamp(value: unknown, low: number, high: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, number));
}

function browserAudioLanguage(): string {
  const language =
    typeof navigator === "undefined" ? "en" : navigator.language || "en";
  const normalized = normalizeAudioLanguage(language);
  return normalized === "und" ? "en" : normalized;
}

function storedAudioLanguage(value: unknown): string {
  if (typeof value !== "string") return browserAudioLanguage();
  return normalizeAudioLanguage(value);
}

export function readPrefs(): PlayerPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS, audioLanguage: browserAudioLanguage() };
    }
    const stored = JSON.parse(raw) as Partial<PlayerPrefs>;
    if (stored?.version !== VERSION) {
      return { ...DEFAULT_PREFS, audioLanguage: browserAudioLanguage() };
    }
    return {
      version: VERSION,
      volume: clamp(stored.volume, 0, 1, DEFAULT_PREFS.volume),
      muted: Boolean(stored.muted),
      audioLanguage: storedAudioLanguage(stored.audioLanguage),
      captionLanguage:
        typeof stored.captionLanguage === "string" ? stored.captionLanguage : null,
      captionSize:
        stored.captionSize === "small" || stored.captionSize === "large"
          ? stored.captionSize
          : "medium",
      captionBackdrop: stored.captionBackdrop !== false,
      playbackRate: clamp(stored.playbackRate, 0.25, 4, DEFAULT_PREFS.playbackRate),
    };
  } catch {
    return { ...DEFAULT_PREFS, audioLanguage: browserAudioLanguage() };
  }
}

let snapshot: PlayerPrefs | null = null;
const listeners = new Set<() => void>();

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function prefsSnapshot(): PlayerPrefs {
  // useSyncExternalStore requires the snapshot identity to remain stable between reads.
  snapshot ??= readPrefs();
  return snapshot;
}

export function prefsOnServer(): PlayerPrefs {
  return DEFAULT_PREFS;
}

export function savePrefs(next: Partial<PlayerPrefs>): PlayerPrefs {
  const merged = { ...prefsSnapshot(), ...next, version: VERSION };
  snapshot = merged;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
  }
  for (const listener of listeners) listener();
  return merged;
}
