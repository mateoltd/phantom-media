import type { ResourceRef } from "./contracts.ts";
export type SavedResource = Extract<ResourceRef, { kind: "vod" | "clip" }>;
export interface HistoryEntry {
  resource: SavedResource;
  channel: string;
  broadcastType: string;
  title?: string;
  previewThumbnailURL?: string;
  timestamp: number;
  lengthSeconds?: number;
}
export const HISTORY_STORAGE = "phantom-watch-history";
export function resourceKey(resource: SavedResource): string { return resource.kind === "vod" ? `vod:${resource.id}` : `clip:${resource.slug}`; }
export function historyPath(entry: HistoryEntry): string { return entry.resource.kind === "vod" ? `/videos/${entry.resource.id}` : `/clips/${encodeURIComponent(entry.resource.slug)}`; }
export function playbackKey(resource: SavedResource): string { return `phantom-playback:${resourceKey(resource)}`; }
export function validHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is HistoryEntry => entry && typeof entry.channel === "string" && typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp) &&
    (entry.resource?.kind === "vod" && /^\d{1,20}$/.test(entry.resource.id) || entry.resource?.kind === "clip" && /^[A-Za-z0-9_-]{1,150}$/.test(entry.resource.slug))).slice(0, 20);
}
export function discoveryHistory(entries: HistoryEntry[]) {
  return entries.flatMap(entry => entry.resource.kind === "vod" ? [{ channel: entry.channel, vodId: entry.resource.id, title: entry.title, timestamp: entry.timestamp }] : []);
}
export function addToHistory(entry: Omit<HistoryEntry, "timestamp">) {
  try {
    const history = validHistory(JSON.parse(localStorage.getItem(HISTORY_STORAGE) ?? "[]"));
    const key = resourceKey(entry.resource), previous = history.find(item => resourceKey(item.resource) === key);
    const filtered = history.filter(item => resourceKey(item.resource) !== key);
    filtered.unshift({ ...previous, ...entry, timestamp: Date.now() });
    localStorage.setItem(HISTORY_STORAGE, JSON.stringify(filtered.slice(0, 20)));
  } catch {}
}
export function readStoredPlayback(resource: SavedResource) {
  try { const value = Number(localStorage.getItem(playbackKey(resource))); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0; } catch { return 0; }
}
export function storePlayback(resource: SavedResource, time: number) {
  if (!Number.isFinite(time) || time < 5) return;
  try { localStorage.setItem(playbackKey(resource), Math.floor(time).toString()); } catch {}
}
