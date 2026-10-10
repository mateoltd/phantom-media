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
const HISTORY_PAUSED = "phantom-watch-history-paused", HISTORY_CHANGE = "phantom-watch-history-change";
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
/** The stored history as text, which compares by value: what a view subscribes to. */
export function storedHistory(): string { try { return localStorage.getItem(HISTORY_STORAGE) ?? "[]"; } catch { return "[]"; } }
export function parseHistory(stored: string): HistoryEntry[] { try { return validHistory(JSON.parse(stored)); } catch { return []; } }
export function historyPaused(): boolean { try { return localStorage.getItem(HISTORY_PAUSED) === "1"; } catch { return false; } }
/** Changes made here, in this tab or another, reach every open view of the history. */
export function subscribeHistory(listener: () => void) {
  window.addEventListener(HISTORY_CHANGE, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(HISTORY_CHANGE, listener); window.removeEventListener("storage", listener); };
}
function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); window.dispatchEvent(new Event(HISTORY_CHANGE)); } catch {}
}
export function saveHistory(entries: HistoryEntry[]) { store(HISTORY_STORAGE, JSON.stringify(entries.slice(0, 20))); }
/** While paused, nothing watched is recorded: no entries and no resume positions. */
export function setHistoryPaused(paused: boolean) { store(HISTORY_PAUSED, paused ? "1" : null); }
export type ForgottenHistory = { entry: HistoryEntry; position: number }[];
/** Forgets the matching entries, all of them by default, along with where each was left. Returns what it took. */
export function forgetHistory(matches: (entry: HistoryEntry) => boolean = () => true): ForgottenHistory {
  const history = parseHistory(storedHistory()), forgotten = history.filter(matches).map(entry => ({ entry, position: readStoredPlayback(entry.resource) }));
  try { forgotten.forEach(({ entry }) => localStorage.removeItem(playbackKey(entry.resource))); } catch {}
  saveHistory(history.filter(entry => !matches(entry)));
  return forgotten;
}
/** Puts back what forgetHistory took, in the order it was watched, around anything watched since. A position saved since then is the newer one and stays. */
export function restoreHistory(forgotten: ForgottenHistory) {
  try { forgotten.forEach(({ entry, position }) => { if (position && !readStoredPlayback(entry.resource)) localStorage.setItem(playbackKey(entry.resource), String(position)); }); } catch {}
  const kept = parseHistory(storedHistory()), keys = new Set(kept.map(entry => resourceKey(entry.resource)));
  saveHistory([...kept, ...forgotten.map(({ entry }) => entry).filter(entry => !keys.has(resourceKey(entry.resource)))].sort((a, b) => b.timestamp - a.timestamp));
}
export function addToHistory(entry: Omit<HistoryEntry, "timestamp">) {
  if (historyPaused()) return;
  const history = parseHistory(storedHistory()), key = resourceKey(entry.resource);
  saveHistory([{ ...history.find(item => resourceKey(item.resource) === key), ...entry, timestamp: Date.now() }, ...history.filter(item => resourceKey(item.resource) !== key)]);
}
export function readStoredPlayback(resource: SavedResource) {
  try { const value = Number(localStorage.getItem(playbackKey(resource))); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0; } catch { return 0; }
}
export function storePlayback(resource: SavedResource, time: number) {
  if (!Number.isFinite(time) || time < 5 || historyPaused()) return;
  try { localStorage.setItem(playbackKey(resource), Math.floor(time).toString()); } catch {}
}
