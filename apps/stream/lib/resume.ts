"use client";

import type { MediaResult } from "./types";

export interface ResumePoint {
  time: number;
  duration: number;
  updatedAt: number;
  completed?: boolean;
}

const STORAGE_KEY = "phantom.stream.progress";
const STORAGE_EVENT = "phantom-stream-progress";
const MAX_ENTRIES = 200;
const MIN_RESUME_SECONDS = 45;
const END_MARGIN_SECONDS = 90;

type ProgressMap = Record<string, ResumePoint>;

function read(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function write(map: ProgressMap): void {
  try {
    const entries = Object.entries(map);
    const trimmed =
      entries.length > MAX_ENTRIES
        ? entries
            .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
            .slice(0, MAX_ENTRIES)
        : entries;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(trimmed)),
    );
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
  }
}

export function progressKey(
  media: Pick<MediaResult, "mediaType" | "id">,
  season: number,
  episode: number,
): string {
  return media.mediaType === "tv"
    ? `tv:${media.id}:${season}:${episode}`
    : `movie:${media.id}`;
}

export function readResumePoint(key: string): ResumePoint | null {
  return read()[key] ?? null;
}

export function readProgressRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeProgress(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
  };
}

export function parseProgress(raw: string): ProgressMap {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ProgressMap;
  } catch {
    return {};
  }
}

export function saveResumePoint(
  key: string,
  time: number,
  duration: number,
): void {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) {
    return;
  }
  const map = read();
  const existing = map[key];
  if (time < MIN_RESUME_SECONDS) {
    if (existing?.completed) return;
    delete map[key];
  } else if (time > duration - END_MARGIN_SECONDS) {
    map[key] = {
      time: duration,
      duration,
      updatedAt: Date.now(),
      completed: true,
    };
  } else {
    map[key] = {
      time,
      duration,
      updatedAt: Date.now(),
      completed: existing?.completed || undefined,
    };
  }
  write(map);
}

export function watchedPercent(point: ResumePoint | null | undefined): number {
  if (!point || point.duration <= 0) return 0;
  if (point.completed) return 100;
  return Math.min(100, Math.max(0, (point.time / point.duration) * 100));
}

export function resumableTime(point: ResumePoint | null): number | null {
  if (!point) return null;
  if (point.time < MIN_RESUME_SECONDS) return null;
  if (point.duration > 0 && point.time > point.duration - END_MARGIN_SECONDS) {
    return null;
  }
  return point.time;
}
