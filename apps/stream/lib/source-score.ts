"use client";

import {
  HALF_LIFE_GLOBAL_MS,
  HALF_LIFE_TITLE_MS,
  blendedScore,
  coarseRegion,
  effectiveWeight,
  relocate,
  reward,
  shouldRecord,
  titleKeyFor,
  update,
} from "../src/source-score.mjs";
import type {
  ScoreRecord,
  SourceObservation,
} from "../src/source-score.d.mts";
import type { ScoreSnapshot } from "../src/router-policy.d.mts";
import type { MediaResult } from "./types";

export type { ScoreRecord, SourceObservation, ScoreSnapshot };

/**
 * Where what the router has learned about each source is kept.
 *
 * The maths is in `src/source-score.mjs` so it can be unit tested; this is the
 * transport, and it is modelled on `lib/resume.ts` because they have the same
 * job and the same failure modes — storage can be full, disabled, or holding
 * something from an older version, and none of that is worth interrupting
 * playback over.
 */

const STORAGE_KEY = "phantom.stream.sources";
const VERSION = 1;

/**
 * Titles are capped well below the resume list because each entry is a map
 * rather than a single point. A hundred and twenty seasons of history is more
 * than anyone accumulates in a sitting and keeps the whole store inside a few
 * tens of kilobytes.
 */
const MAX_TITLES = 120;

export interface ScoreStore {
  version: number;
  /** Continent segment. A partition label for a store that is not yet shared. */
  region: string;
  sources: Record<string, ScoreRecord>;
  titles: Record<string, Record<string, ScoreRecord>>;
}

/**
 * The seam a shared store would sit behind.
 *
 * Both methods are synchronous on purpose: the router reads scores on the
 * critical path, before it issues the first request, and an async read would
 * add a hop to precisely the latency this work exists to cut. A server-backed
 * adapter therefore reads through a local cache and refreshes in the
 * background for the next race rather than blocking this one.
 */
export interface ScoreTransport {
  load(): ScoreStore | null;
  save(store: ScoreStore): void;
}

function emptyStore(region: string): ScoreStore {
  return { version: VERSION, region, sources: {}, titles: {} };
}

function currentRegion(): string {
  try {
    return coarseRegion(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "unknown";
  }
}

const localTransport: ScoreTransport = {
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ScoreStore;
      // Everything here is reconstructible by watching sources work, so a
      // store from another version is discarded rather than migrated.
      if (parsed?.version !== VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  save(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Full or disabled. Losing what was learned costs a slower race, and
      // that is the right thing to lose.
    }
  },
};

let transport: ScoreTransport = localTransport;

export function setScoreTransport(next: ScoreTransport): void {
  transport = next;
}

function load(): ScoreStore {
  const region = currentRegion();
  const stored = transport.load();
  if (!stored) return emptyStore(region);
  if (stored.region !== region) {
    // Which source carries which title travels; which one is reachable and
    // fast does not. Halving keeps the first and lets the second be relearned.
    return {
      ...stored,
      region,
      sources: relocate(stored.sources ?? {}),
      titles: Object.fromEntries(
        Object.entries(stored.titles ?? {}).map(([key, records]) => [
          key,
          relocate(records),
        ]),
      ),
    };
  }
  return {
    version: VERSION,
    region,
    sources: stored.sources ?? {},
    titles: stored.titles ?? {},
  };
}

/** Newest first out, so a long history never grows past the quota. */
function evictTitles(titles: ScoreStore["titles"]): ScoreStore["titles"] {
  const keys = Object.keys(titles);
  if (keys.length <= MAX_TITLES) return titles;
  const freshest = (records: Record<string, ScoreRecord>) =>
    Object.values(records).reduce((newest, record) => Math.max(newest, record.t), 0);
  const kept = keys
    .sort((left, right) => freshest(titles[right]!) - freshest(titles[left]!))
    .slice(0, MAX_TITLES);
  return Object.fromEntries(kept.map((key) => [key, titles[key]!]));
}

function save(store: ScoreStore): void {
  transport.save({ ...store, titles: evictTitles(store.titles) });
}

export function titleKey(
  media: Pick<MediaResult, "mediaType" | "id">,
  season: number,
): string {
  return titleKeyFor(media.mediaType, media.id, season);
}

/**
 * One decayed read per race.
 *
 * A snapshot rather than a live reader, so ordering is decided once and cannot
 * shift underneath a race that is already running.
 */
export function readScores(key: string): ScoreSnapshot {
  const store = load();
  const now = Date.now();
  const titles = store.titles[key] ?? {};
  return {
    now,
    score: (sourceId) => blendedScore(store.sources[sourceId], titles[sourceId], now),
    weight: (sourceId) =>
      effectiveWeight(store.sources[sourceId], now, HALF_LIFE_GLOBAL_MS),
    titleWeight: (sourceId) =>
      effectiveWeight(titles[sourceId], now, HALF_LIFE_TITLE_MS),
  };
}

export function recordObservation(observation: SourceObservation): void {
  if (!shouldRecord(observation)) return;

  const store = load();
  const now = Date.now();
  const value = reward(observation);

  store.sources[observation.sourceId] = update(
    store.sources[observation.sourceId],
    value,
    now,
    HALF_LIFE_GLOBAL_MS,
  );

  const titles = store.titles[observation.titleKey] ?? {};
  titles[observation.sourceId] = update(
    titles[observation.sourceId],
    value,
    now,
    HALF_LIFE_TITLE_MS,
  );
  store.titles[observation.titleKey] = titles;

  save(store);
}

/** For a debug surface, and for a future adapter that needs the whole store. */
export function readStore(): ScoreStore {
  return load();
}

export function clearScores(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do about it, and nothing depends on it having worked.
  }
}
