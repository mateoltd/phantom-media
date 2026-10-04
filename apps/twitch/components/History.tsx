"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@/lib/hooks";

export interface HistoryEntry {
  vodId: string;
  channel: string;
  broadcastType: string;
  title?: string;
  previewThumbnailURL?: string;
  timestamp: number;
  lengthSeconds?: number;
}

export function useHistory() {
  return useHydratedHistory()[0];
}

/** False until the browser's history has been read. The server, and the first render in the browser, cannot know it. */
export function useHistoryRead() {
  const [read, setRead] = useState(false);
  useEffect(() => setRead(true), []);
  return read;
}

export function useHistoryEditor() {
  const [history, setHistory] = useHydratedHistory();
  const forget = (entries: HistoryEntry[]) => {
    try { entries.forEach((entry) => localStorage.removeItem(`phantom-playback:${entry.vodId}`)); } catch {}
  };
  return {
    history,
    remove(vodId: string) {
      forget(history.filter((entry) => entry.vodId === vodId));
      setHistory(history.filter((entry) => entry.vodId !== vodId));
    },
    clear() {
      forget(history);
      setHistory([]);
    },
  };
}

function useHydratedHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("phantom-history", []);
  const hydrated = useRef(new Set<string>());
  useEffect(() => {
    const missing = history.slice(0, 5).filter((entry) => !hydrated.current.has(entry.vodId) && (!entry.title || !entry.lengthSeconds || !entry.previewThumbnailURL || entry.previewThumbnailURL.includes("/_404/")));
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async (entry) => {
      try {
        const response = await fetch(`/api/vod/metadata?vodId=${encodeURIComponent(entry.vodId)}`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return { ...entry, ...data, timestamp: entry.timestamp,
          previewThumbnailURL: data.previewThumbnailURL?.includes("/_404/") ? entry.previewThumbnailURL : data.previewThumbnailURL || entry.previewThumbnailURL,
        } as HistoryEntry;
      } catch { return null; }
    })).then((results) => {
      if (controller.signal.aborted) return;
      missing.forEach((entry) => hydrated.current.add(entry.vodId));
      const updates = new Map(results.filter((entry): entry is HistoryEntry => Boolean(entry)).map((entry) => [entry.vodId, entry]));
      if (updates.size) setHistory(history.map((entry) => updates.get(entry.vodId) ?? entry));
    });
    return () => controller.abort();
  }, [history, setHistory]);
  return [history, setHistory] as const;
}

export function addToHistory(entry: Omit<HistoryEntry, "timestamp">) {
  try {
    const stored = localStorage.getItem("phantom-history");
    const history: HistoryEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = history.filter((h) => h.vodId !== entry.vodId);
    filtered.unshift({ ...history.find((item) => item.vodId === entry.vodId), ...entry, timestamp: Date.now() });
    localStorage.setItem(
      "phantom-history",
      JSON.stringify(filtered.slice(0, 20))
    );
  } catch {}
}
