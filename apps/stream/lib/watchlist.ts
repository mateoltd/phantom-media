"use client";

import { useSyncExternalStore } from "react";
import type { MediaResult } from "./types";

export type WatchlistMedia = Pick<
  MediaResult,
  "id" | "mediaType" | "title" | "posterUrl" | "year" | "rating"
>;
export type SavedTitle = WatchlistMedia & { savedAt: number };

const STORAGE_KEY = "phantom-stream:watchlist:v1";
interface Snapshot {
  items: SavedTitle[];
  ready: boolean;
  error: string | null;
}
const serverSnapshot: Snapshot = { items: [], ready: false, error: null };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();

export function parseWatchlist(raw: string | null): SavedTitle[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid watchlist");
  const seen = new Set<string>();
  return parsed.filter((item): item is SavedTitle => {
    if (
      !item || typeof item !== "object" ||
      typeof item.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(item.id) ||
      (item.mediaType !== "movie" && item.mediaType !== "tv") ||
      typeof item.title !== "string" || !item.title.trim() ||
      (item.posterUrl !== null && typeof item.posterUrl !== "string") ||
      typeof item.year !== "string" ||
      typeof item.rating !== "number" || !Number.isFinite(item.rating) ||
      typeof item.savedAt !== "number" || !Number.isFinite(item.savedAt)
    ) return false;
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.savedAt - a.savedAt);
}

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function refresh() {
  try {
    publish({ items: parseWatchlist(localStorage.getItem(STORAGE_KEY)), ready: true, error: null });
  } catch {
    publish({ ...snapshot, ready: true, error: "Your watchlist could not be read. Check that browser storage is available, then reload." });
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function toggleWatchlist(media: WatchlistMedia) {
  try {
    const items = parseWatchlist(localStorage.getItem(STORAGE_KEY));
    const exists = items.some((item) => item.id === media.id && item.mediaType === media.mediaType);
    const next = exists
      ? items.filter((item) => item.id !== media.id || item.mediaType !== media.mediaType)
      : [{ id: media.id, mediaType: media.mediaType, title: media.title, posterUrl: media.posterUrl,
          year: media.year, rating: media.rating, savedAt: Date.now() }, ...items];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    publish({ items: next, ready: true, error: null });
  } catch {
    publish({ ...snapshot, ready: true, error: "Changes could not be saved. Check that browser storage is available and has space, then try again." });
  }
}

export function useWatchlist() {
  return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}
