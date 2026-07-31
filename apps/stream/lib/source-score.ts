"use client";

import {
  HALF_LIFE_GLOBAL_MS,
  HALF_LIFE_TITLE_MS,
  blendedScore,
  coarseRegion,
  effectiveWeight,
  mergeRecords,
  observationScopes,
  relocate,
  reward,
  shouldRecord,
  titleKeyFor,
  update,
} from "../src/source-score.mjs";
import { failureDomainFor } from "../src/failure-domain.mjs";
import type {
  ScoreRecord,
  SourceObservation,
} from "../src/source-score.d.mts";
import type { ScoreSnapshot } from "../src/router-policy.d.mts";
import type { MediaResult } from "./types";

export type { ScoreRecord, SourceObservation, ScoreSnapshot };

const STORAGE_KEY = "phantom.stream.sources";
const VERSION = 2;

const MAX_TITLES = 120;

export interface ScoreStore {
  version: number;
  region: string;
  sources: Record<string, ScoreRecord>;
  titles: Record<string, Record<string, ScoreRecord>>;
}

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
  const canonicalSources = canonicalizeRecords(stored.sources ?? {});
  const canonicalTitles = Object.fromEntries(
    Object.entries(stored.titles ?? {}).map(([key, records]) => [
      key,
      canonicalizeRecords(records),
    ]),
  );
  if (stored.region !== region) {
    return {
      ...stored,
      region,
      sources: relocate(canonicalSources),
      titles: Object.fromEntries(
        Object.entries(canonicalTitles).map(([key, records]) => [
          key,
          relocate(records),
        ]),
      ),
    };
  }
  return {
    version: VERSION,
    region,
    sources: canonicalSources,
    titles: canonicalTitles,
  };
}

function canonicalizeRecords(
  records: Record<string, ScoreRecord>,
): Record<string, ScoreRecord> {
  const canonical: Record<string, ScoreRecord> = {};
  for (const [sourceId, record] of Object.entries(records)) {
    const domain = failureDomainFor(sourceId);
    canonical[domain] = mergeRecords(canonical[domain], record) ?? record;
  }
  return canonical;
}

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

export function readScores(key: string): ScoreSnapshot {
  const store = load();
  const now = Date.now();
  const titles = store.titles[key] ?? {};
  return {
    now,
    score: (sourceId) => {
      const domain = failureDomainFor(sourceId);
      return blendedScore(store.sources[domain], titles[domain], now);
    },
    weight: (sourceId) =>
      effectiveWeight(
        store.sources[failureDomainFor(sourceId)],
        now,
        HALF_LIFE_GLOBAL_MS,
      ),
    titleWeight: (sourceId) => {
      const domain = failureDomainFor(sourceId);
      return effectiveWeight(titles[domain], now, HALF_LIFE_TITLE_MS);
    },
  };
}

export function recordObservation(observation: SourceObservation): void {
  if (!shouldRecord(observation)) return;

  const store = load();
  const now = Date.now();
  const value = reward(observation);
  const domain = failureDomainFor(observation.sourceId);
  const scopes = observationScopes(observation);

  if (scopes.global) {
    store.sources[domain] = update(
      store.sources[domain],
      value,
      now,
      HALF_LIFE_GLOBAL_MS,
    );
  }

  if (scopes.title) {
    const titles = store.titles[observation.titleKey] ?? {};
    titles[domain] = update(
      titles[domain],
      value,
      now,
      HALF_LIFE_TITLE_MS,
    );
    store.titles[observation.titleKey] = titles;
  }

  save(store);
}

export function readStore(): ScoreStore {
  return load();
}

export function clearScores(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}
