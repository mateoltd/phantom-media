"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/lib/hooks";
import { HISTORY_STORAGE, resourceKey, playbackKey, validHistory, type HistoryEntry } from "@/lib/history";

export function useHistory() {
  return useHydratedHistory()[0];
}

export function useHistoryRead() {
  const [read, setRead] = useState(false);
  useEffect(() => setRead(true), []);
  return read;
}

export function useHistoryEditor() {
  const [history, setHistory] = useHydratedHistory();
  const forget = (entries: HistoryEntry[]) => {
    try { entries.forEach((entry) => localStorage.removeItem(playbackKey(entry.resource))); } catch {}
  };
  return {
    history,
    remove(key: string) {
      forget(history.filter((entry) => resourceKey(entry.resource) === key));
      setHistory(history.filter((entry) => resourceKey(entry.resource) !== key));
    },
    clear() {
      forget(history);
      setHistory([]);
    },
  };
}

function useHydratedHistory() {
  const [stored, setHistory] = useLocalStorage<HistoryEntry[]>(HISTORY_STORAGE, []);
  const history = useMemo(() => validHistory(stored), [stored]);
  const hydrated = useRef(new Set<string>());
  useEffect(() => {
    const missing = history.slice(0, 5).filter((entry) => entry.resource.kind === "vod" && !hydrated.current.has(resourceKey(entry.resource)) && (!entry.title || !entry.lengthSeconds || !entry.previewThumbnailURL || entry.previewThumbnailURL.includes("/_404/")));
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async (entry) => {
      try {
        const response = await fetch(`/api/vod/metadata?vodId=${encodeURIComponent(entry.resource.kind === "vod" ? entry.resource.id : "")}`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return { ...entry, title: data.title, lengthSeconds: data.lengthSeconds, channel: data.channel, timestamp: entry.timestamp,
          previewThumbnailURL: data.previewThumbnailURL?.includes("/_404/") ? entry.previewThumbnailURL : data.previewThumbnailURL || entry.previewThumbnailURL,
        } as HistoryEntry;
      } catch { return null; }
    })).then((results) => {
      if (controller.signal.aborted) return;
      missing.forEach((entry) => hydrated.current.add(resourceKey(entry.resource)));
      const updates = new Map(results.filter((entry): entry is HistoryEntry => Boolean(entry)).map((entry) => [resourceKey(entry.resource), entry]));
      if (updates.size) setHistory(history.map((entry) => updates.get(resourceKey(entry.resource)) ?? entry));
    });
    return () => controller.abort();
  }, [history, setHistory]);
  return [history, setHistory] as const;
}
