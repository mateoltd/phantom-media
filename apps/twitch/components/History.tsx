"use client";

import { useEffect } from "react";
import { MediaTile } from "@phantom/ui";
import { useLocalStorage } from "@/lib/hooks";

export interface HistoryEntry {
  vodId: string;
  channel: string;
  broadcastType: string;
  title?: string;
  previewThumbnailURL?: string;
  timestamp: number;
}

interface HistoryProps {
  entries: HistoryEntry[];
  onSelect: (vodId: string) => void;
}

function formatType(type: string) {
  if (type === "highlight") return "Highlight";
  if (type === "upload") return "Upload";
  return "Archive";
}

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function useHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("phantom-history", []);
  useEffect(() => {
    const missing = history.slice(0, 5).filter((entry) => !entry.title || !entry.previewThumbnailURL);
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async (entry) => {
      try {
        const response = await fetch(`/api/vod/metadata?vodId=${encodeURIComponent(entry.vodId)}`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return { ...entry, ...data, timestamp: entry.timestamp } as HistoryEntry;
      } catch { return null; }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const updates = new Map(results.filter((entry): entry is HistoryEntry => Boolean(entry?.title && entry?.previewThumbnailURL)).map((entry) => [entry.vodId, entry]));
      if (updates.size) setHistory(history.map((entry) => updates.get(entry.vodId) ?? entry));
    });
    return () => controller.abort();
  }, [history, setHistory]);
  return history;
}

export function History({ entries, onSelect }: HistoryProps) {
  if (entries.length === 0) return null;
  return (
    <section className="twitch-history">
      <h2 className="text-xl font-medium text-text">Continue watching</h2>
      <div className="twitch-history-rail">
        {entries.slice(0, 5).map((entry) => (
          <button key={entry.vodId} onClick={() => onSelect(entry.vodId)} className="media-tile-hit group min-w-0 text-left">
            <MediaTile title={entry.title || entry.channel} imageUrl={entry.previewThumbnailURL} sizes="280px"
              meta={<><span>{entry.channel}</span><span>{formatType(entry.broadcastType)}</span><span>{timeAgo(entry.timestamp)}</span></>} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function addToHistory(entry: Omit<HistoryEntry, "timestamp">) {
  try {
    const stored = localStorage.getItem("phantom-history");
    const history: HistoryEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = history.filter((h) => h.vodId !== entry.vodId);
    filtered.unshift({ ...entry, timestamp: Date.now() });
    localStorage.setItem(
      "phantom-history",
      JSON.stringify(filtered.slice(0, 20))
    );
  } catch {}
}
