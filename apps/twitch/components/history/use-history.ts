"use client";

import { useEffect, useEffectEvent, useMemo, useSyncExternalStore } from "react";
import { addToHistory, historyPaused, parseHistory, resourceKey, saveHistory, storedHistory, subscribeHistory, type HistoryEntry } from "@/lib/history";

// On the server and while hydrating the history is unread, which is not the same as empty.
const unread = () => null;
const unpaused = () => false;

export function useHistoryRead() {
  return useSyncExternalStore(subscribeHistory, storedHistory, unread) !== null;
}

export function useHistoryPaused() {
  return useSyncExternalStore(subscribeHistory, historyPaused, unpaused);
}

/** Records what is playing: when it opens, and again if history is unpaused while it is still on screen. */
export function useHistoryRecord(entry: Omit<HistoryEntry, "timestamp"> | null) {
  const paused = useHistoryPaused();
  const key = entry && resourceKey(entry.resource);
  const record = useEffectEvent(() => { if (entry) addToHistory(entry); });
  useEffect(() => { if (key && !paused) record(); }, [key, paused]);
}

// Videos whose details have been asked for since the page loaded, whichever view of the history asked.
const described = new Set<string>();

export function useHistory() {
  const stored = useSyncExternalStore(subscribeHistory, storedHistory, unread);
  const history = useMemo(() => parseHistory(stored ?? "[]"), [stored]);
  useEffect(() => {
    const missing = history.slice(0, 5).filter((entry) => entry.resource.kind === "vod" && !described.has(resourceKey(entry.resource)) && (!entry.title || !entry.lengthSeconds || !entry.previewThumbnailURL || entry.previewThumbnailURL.includes("/_404/")));
    if (!missing.length) return;
    const controller = new AbortController();
    let settled = false;
    missing.forEach((entry) => described.add(resourceKey(entry.resource)));
    void Promise.all(missing.map(async (entry) => {
      try {
        const response = await fetch(`/api/vod/metadata?vodId=${encodeURIComponent(entry.resource.kind === "vod" ? entry.resource.id : "")}`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return { ...entry, title: data.title, lengthSeconds: data.lengthSeconds, channel: data.channel,
          previewThumbnailURL: data.previewThumbnailURL?.includes("/_404/") ? entry.previewThumbnailURL : data.previewThumbnailURL || entry.previewThumbnailURL,
        } as HistoryEntry;
      } catch { return null; }
    })).then((results) => {
      if (controller.signal.aborted) return;
      settled = true;
      const updates = new Map(results.filter((entry): entry is HistoryEntry => Boolean(entry)).map((entry) => [resourceKey(entry.resource), entry]));
      // Applied to what is stored now, so an entry removed in the meantime stays removed.
      if (updates.size) saveHistory(parseHistory(storedHistory()).map((entry) => updates.get(resourceKey(entry.resource)) ?? entry));
    });
    return () => {
      controller.abort();
      if (!settled) missing.forEach((entry) => described.delete(resourceKey(entry.resource)));
    };
  }, [history]);
  return history;
}
