import { ResourceCache } from "../cache.ts";
import { HISTORY_STORAGE, validHistory } from "../history.ts";
import { ChannelSearchIndex } from "./ranking.ts";
import { SEARCH_SEEDS } from "./seeds.ts";
import { observedChannel, readSearchChannels, type SearchChannel, type SearchVisit } from "./contracts.ts";
import type { DiscoveryChannel } from "../discovery/ranking.ts";
import { prepareSearchAvatar, searchAvatarReady } from "./avatars.ts";

const index = new ChannelSearchIndex();
index.put(SEARCH_SEEDS);
const QUERY_TTL = 30_000;
type QueryReceipt = { results: SearchChannel[]; matchedLogins: string[]; matchedUntil: number; missing: string[]; checkedAt: number };
const reads = new ResourceCache<QueryReceipt>(64);
const listeners = new Set<() => void>();
let revision = 0, initialized = false, warmUntil = 0, warming: Promise<void> | undefined;
let visits: SearchVisit[] = [];
const selectedVisits = new Map<string, SearchVisit>();
const SAVED = "phantom-search-channels";
const CANDIDATES = "phantom-search-index";
const selections = new Map<string, SearchChannel>();
function changed() { revision++; listeners.forEach(listener => listener()); }
export const subscribeSearch = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const searchRevision = () => revision;
export const serverSearchRevision = () => 0;

export function initializeSearch() {
  if (initialized) return;
  initialized = true;
  try {
    index.put(readSearchChannels(JSON.parse(localStorage.getItem(CANDIDATES) ?? "[]")).slice(-256));
    const saved = readSearchChannels(JSON.parse(localStorage.getItem(SAVED) ?? "[]")).slice(0, 48);
    saved.forEach(channel => selections.set(channel.login, channel)); index.put(saved);
  } catch {}
  refreshSearchHistory();
  void prepareSearchRows(index.snapshot().filter(channel => channel.isLive !== undefined).slice(-12)).then(changed);
  window.addEventListener("storage", event => { if (event.key === HISTORY_STORAGE || event.key === null) refreshSearchHistory(); });
}

/** Read on opening search too: native storage events do not fire in the writing tab. */
export function refreshSearchHistory() {
  let history: SearchVisit[] = [];
  try { history = validHistory(JSON.parse(localStorage.getItem(HISTORY_STORAGE) ?? "[]")); } catch {}
  visits = [...selectedVisits.values(), ...history].slice(0, 100);
  index.put(history.map(({ channel }) => ({ login: channel.toLowerCase(), displayName: channel })));
  changed();
}

/** One coalesced shelf refresh for both header and home search, not per keystroke. */
export function warmSearch(): Promise<void> {
  initializeSearch();
  if (Date.now() < warmUntil) return Promise.resolve();
  if (warming) return warming;
  warming = fetch("/api/channel/search/index", { signal: AbortSignal.timeout(4000) }).then(async response => {
    if (!response.ok) throw new Error("Search index unavailable");
    const data = await response.json(); const channels = readSearchChannels(data.channels);
    index.put(channels); saveCandidateIndex(); changed();
    await prepareSearchRows(channels.filter(channel => channel.isLive !== undefined).slice(0, 12)); changed();
    warmUntil = Date.now() + 60_000;
  }).catch(() => { warmUntil = Date.now() + 30_000; }).finally(() => { warming = undefined; });
  return warming;
}
function saveCandidateIndex() {
  try { localStorage.setItem(CANDIDATES, JSON.stringify(index.snapshot().filter(channel => channel.observedAt).slice(-256))); } catch {}
}
async function prepareSearchRows(channels: SearchChannel[]) {
  await Promise.all(channels.map(async channel => {
    if (searchAvatarReady(channel.profileImageURL)) return;
    await prepareSearchAvatar(channel.profileImageURL);
    changed();
  }));
}
export async function prepareSearchResults(query: string) {
  const channels = index.search(query, visits, 8, Date.now(), queryMatches(query), channel => channel.isLive !== undefined);
  const waiting = channels.filter(channel => !searchAvatarReady(channel.profileImageURL));
  if (!waiting.length) return;
  await prepareSearchRows(waiting); changed();
}
export function localChannelSearch(query: string) {
  return index.search(query, visits, 8, Date.now(), queryMatches(query),
    channel => channel.isLive !== undefined && searchAvatarReady(channel.profileImageURL));
}
function queryReceipts(query: string) {
  const key = query.toLowerCase();
  return ["expanded", "quick"].flatMap(source => {
    const receipt = reads.get(`${source}:${key}`);
    return receipt && receipt.matchedUntil > Date.now() ? [receipt] : [];
  });
}
function queryMatches(query: string) {
  return [...new Set(queryReceipts(query).flatMap(receipt => receipt.matchedLogins))].slice(0, 40);
}
export function searchMatchDeadline(query: string) {
  const deadlines = queryReceipts(query).filter(receipt => receipt.matchedLogins.length).map(receipt => receipt.matchedUntil);
  return deadlines.length ? Math.min(...deadlines) : undefined;
}
export async function refreshChannelSearch(query: string, signal: AbortSignal, expanded = false) {
  const key = query.toLowerCase();
  const cacheKey = `${expanded ? "expanded" : "quick"}:${key}`;
  const result = await reads.load(cacheKey, async () => {
    const path = !expanded && !query.startsWith("@") ? "/api/channel/search/suggestions" : "/api/channel/search";
    const response = await fetch(`${path}?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(2500) });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Search unavailable. Try again.");
    const results = readSearchChannels(data.results).slice(0, 64);
    const candidates = new Set(results.map(channel => channel.login));
    return { results, matchedLogins: Array.isArray(data.matchedLogins) ? data.matchedLogins.filter((login: unknown): login is string => typeof login === "string" && candidates.has(login)).slice(0, 40) : [], matchedUntil: Date.now() + QUERY_TTL,
      missing: Array.isArray(data.missing) ? data.missing.filter((login: unknown): login is string => typeof login === "string" && /^[a-z0-9_]{3,25}$/.test(login)).slice(0, 8) : [],
      checkedAt: Number.isFinite(data.checkedAt) && data.checkedAt > 0 ? Math.min(Date.now(), data.checkedAt) : Date.now() };
  }, QUERY_TTL, signal);
  if (signal.aborted) return;
  index.remove(result.missing, result.checkedAt); index.put(result.results); saveCandidateIndex();
  await prepareSearchResults(query);
  if (!signal.aborted) changed();
}
export function learnDiscoveryChannels(channels: DiscoveryChannel[]) {
  index.put(channels.map(channel => observedChannel(channel))); saveCandidateIndex(); changed();
}
export function rememberSearchSelection(login: string) {
  const channel = index.snapshot().find(channel => channel.login === login);
  if (!channel) return;
  selections.delete(login); selections.set(login, channel);
  if (selections.size > 48) selections.delete(selections.keys().next().value!);
  visits = [{ channel: login, timestamp: Date.now() }, ...visits.filter(visit => visit.channel !== login)].slice(0, 100);
  selectedVisits.delete(login); selectedVisits.set(login, visits[0]);
  if (selectedVisits.size > 48) selectedVisits.delete(selectedVisits.keys().next().value!);
  try { localStorage.setItem(SAVED, JSON.stringify([...selections.values()])); } catch {}
  changed();
}
