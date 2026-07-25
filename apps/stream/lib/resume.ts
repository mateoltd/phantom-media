"use client";

import type { MediaResult } from "./types";

export interface ResumePoint {
  time: number;
  duration: number;
  updatedAt: number;
}

const STORAGE_KEY = "phantom.stream.progress";
const MAX_ENTRIES = 200;
/** Below this, resuming is more annoying than starting over. */
const MIN_RESUME_SECONDS = 45;
/** Within this of the end, the thing was finished. */
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
    // Oldest first out, so a long history never grows past the quota.
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
  } catch {
    // Storage can be full or disabled. Losing a resume point is not worth
    // interrupting playback over.
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

/** The raw record, as stored. Stable between reads, so it is safe to snapshot. */
export function readProgressRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
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
  if (time < MIN_RESUME_SECONDS || time > duration - END_MARGIN_SECONDS) {
    // Finished, or barely started: nothing worth coming back to.
    delete map[key];
  } else {
    map[key] = { time, duration, updatedAt: Date.now() };
  }
  write(map);
}

/** The point to seek to, or `null` when there is nothing worth resuming. */
export function resumableTime(point: ResumePoint | null): number | null {
  if (!point) return null;
  if (point.time < MIN_RESUME_SECONDS) return null;
  if (point.duration > 0 && point.time > point.duration - END_MARGIN_SECONDS) {
    return null;
  }
  return point.time;
}
