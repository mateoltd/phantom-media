"use client";

/**
 * The handful of choices that should not have to be made twice.
 *
 * Volume, captions and speed are settings about a person, not about a title,
 * so re-picking a subtitle language at the start of every episode is the sort
 * of small friction that makes a player feel unfinished. Same shape as
 * `lib/resume.ts`: try/catch on every access, and nothing here is important
 * enough to interrupt playback over.
 */

const STORAGE_KEY = "phantom.stream.prefs";
const VERSION = 1;

export type CaptionSize = "small" | "medium" | "large";

export interface PlayerPrefs {
  version: number;
  volume: number;
  muted: boolean;
  /** Normalised language code, or null for captions off. */
  captionLanguage: string | null;
  captionSize: CaptionSize;
  /** Opaque backdrop behind cues, for bright or busy footage. */
  captionBackdrop: boolean;
  playbackRate: number;
}

export const DEFAULT_PREFS: PlayerPrefs = {
  version: VERSION,
  volume: 1,
  muted: false,
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

export function readPrefs(): PlayerPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = JSON.parse(raw) as Partial<PlayerPrefs>;
    if (stored?.version !== VERSION) return DEFAULT_PREFS;
    return {
      version: VERSION,
      volume: clamp(stored.volume, 0, 1, DEFAULT_PREFS.volume),
      muted: Boolean(stored.muted),
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
    return DEFAULT_PREFS;
  }
}

/* -------------------------------------------------------------------------- */
/* As an external store                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Preferences are a fact about the browser, and the server has no browser.
 * Reading them during render is what would make the two trees disagree, so the
 * player subscribes to them instead, with an explicit server answer of "the
 * defaults" — the same shape the picture-in-picture check uses.
 *
 * The cached snapshot is what makes this safe to subscribe to: the value has
 * to be referentially stable between reads, or every render counts as a
 * change.
 */
let snapshot: PlayerPrefs | null = null;
const listeners = new Set<() => void>();

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function prefsSnapshot(): PlayerPrefs {
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
    // Full or disabled. The setting still applies for this sitting.
  }
  for (const listener of listeners) listener();
  return merged;
}
