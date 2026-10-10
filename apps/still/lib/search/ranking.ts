import type { SearchChannel, SearchVisit } from "./contracts.ts";

export const normalizeSearch = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/^@/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const compact = (value: string) => value.replace(/ /g, "");
export const SEARCH_OBSERVATION_TTL = 120_000;
export const SEARCH_POPULARITY_TTL = 7 * 86_400_000;
interface IndexedChannel { channel: SearchChannel; names: string[]; context: string }

/** Banded edit distance with adjacent transpositions, bounded to two edits.
 * Length and row cutoffs avoid a full matrix for unrelated names. */
function distance(a: string, b: string, maximum: number): number {
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let before = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = Array<number>(b.length + 1).fill(maximum + 1); row[0] = i;
    let smallest = maximum + 1;
    for (let j = Math.max(1, i - maximum); j <= Math.min(b.length, i + maximum); j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      smallest = Math.min(smallest, row[j]);
    }
    if (smallest > maximum) return maximum + 1;
    before = previous; previous = row;
  }
  return previous[b.length];
}

function relevance(item: IndexedChannel, term: string): number {
  const key = compact(term), tokens = term.split(" ");
  let best = 0;
  for (const name of item.names) {
    const joined = compact(name);
    if (name === term || joined === key) return 1000;
    if (name.startsWith(term) || joined.startsWith(key)) best = Math.max(best, 850);
    else if (tokens.every(token => name.split(" ").some(word => word.startsWith(token)))) best = Math.max(best, 800);
    else if (name.includes(term) || joined.includes(key)) best = Math.max(best, 650);
    else if (key.length >= 4 && key.length <= 25 && joined.length <= 25) {
      const edits = distance(key, joined, key.length >= 8 ? 2 : 1);
      if (edits <= (key.length >= 8 ? 2 : 1)) best = Math.max(best, 450 - edits * 20);
    }
  }
  // Category/title are useful discovery clues but always rank below a name match.
  if (!best && key.length >= 3 && tokens.every(token => item.context.includes(token))) best = 250;
  return best;
}

/** Shared browser/server index. Names are precomputed; only a bounded top-k is sorted. */
export class ChannelSearchIndex {
  private entries = new Map<string, IndexedChannel>();
  private absent = new Map<string, { at: number; until: number }>();
  private capacity: number;
  constructor(capacity = 2000) { this.capacity = capacity; }
  put(channels: SearchChannel[]) {
    for (const channel of channels) {
      const login = channel.login?.toLowerCase();
      if (!login || !/^[a-z0-9_]{3,25}$/.test(login) || typeof channel.displayName !== "string") continue;
      const missing = this.absent.get(login);
      if (missing && missing.until > Date.now() && (!channel.observedAt || channel.observedAt <= missing.at)) continue;
      this.absent.delete(login);
      const old = this.entries.get(login)?.channel;
      // An older observation or a name-only hint must not overwrite newer live data.
      const merged = old && (old.observedAt ?? 0) > (channel.observedAt ?? 0) ? { ...channel, ...old } : { ...old, ...channel };
      // Discovery/live observations need not carry durable audience metadata.
      // Merge that group by its own clock, including a genuine new zero count.
      const audience = old && (old.popularityObservedAt ?? 0) > (channel.popularityObservedAt ?? 0) ? old : channel;
      merged.followerCount = audience.followerCount;
      merged.isPartner = audience.isPartner;
      merged.popularityObservedAt = audience.popularityObservedAt;
      const verification = old && (old.verifiedObservedAt ?? 0) > (channel.verifiedObservedAt ?? 0) ? old : channel;
      merged.isVerified = verification.isVerified;
      merged.verifiedObservedAt = verification.verifiedObservedAt;
      merged.login = login;
      this.entries.delete(login);
      this.entries.set(login, { channel: merged, names: [...new Set([normalizeSearch(login), normalizeSearch(merged.displayName)])], context: normalizeSearch(`${merged.gameName ?? ""} ${merged.title ?? ""}`) });
      if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    }
  }
  remove(logins: string[], checkedAt = Date.now()) {
    logins.forEach(login => {
      const key = login.toLowerCase();
      if ((this.entries.get(key)?.channel.observedAt ?? 0) > checkedAt || (this.absent.get(key)?.at ?? 0) > checkedAt) return;
      this.entries.delete(key); this.absent.delete(key);
      this.absent.set(key, { at: checkedAt, until: Date.now() + 60_000 });
    });
    while (this.absent.size > this.capacity) this.absent.delete(this.absent.keys().next().value!);
  }
  snapshot(now = Date.now()): SearchChannel[] {
    return [...this.entries.values()].map(({ channel }) => this.fresh(channel, now));
  }
  private fresh(channel: SearchChannel, now: number): SearchChannel {
    const live = channel.observedAt && now - channel.observedAt < SEARCH_OBSERVATION_TTL;
    const popularity = channel.popularityObservedAt && now - channel.popularityObservedAt < SEARCH_POPULARITY_TTL;
    const verification = channel.verifiedObservedAt && now - channel.verifiedObservedAt < SEARCH_OBSERVATION_TTL;
    if (live && popularity && verification) return channel;
    return { ...channel,
      ...(!live ? { isLive: undefined, viewersCount: undefined, title: undefined, gameName: undefined } : {}),
      ...(!verification ? { isVerified: undefined } : {}),
      ...(!popularity ? { followerCount: undefined, isPartner: undefined } : {}) };
  }
  search(query: string, visits: SearchVisit[] = [], limit = 8, now = Date.now(), matchedLogins: readonly string[] = [], eligible?: (channel: SearchChannel) => boolean): SearchChannel[] {
    const term = normalizeSearch(query);
    const length = compact(term).length;
    if (length < 2 || term.length > 80) return [];
    const explicit = query.trim().startsWith("@");
    // Short inputs are usually incomplete names. Specificity gradually restores
    // exact-name confidence and reduces popularity's ability to override it.
    const ambiguity = Math.max(0, Math.min(1, (8 - length) / 4));
    const affinity = new Map<string, number>();
    // Upstream semantic relevance belongs to this query only. It must never
    // turn a discovered channel into a generic recommendation for other words.
    const upstream = new Map(matchedLogins.slice(0, 40).map((login, position) => [login, 12 * (1 - position / 40)]));
    for (const visit of visits.slice(0, 100)) {
      const weight = 160 * Math.pow(0.5, Math.max(0, now - visit.timestamp) / (7 * 86_400_000));
      affinity.set(visit.channel.toLowerCase(), Math.max(affinity.get(visit.channel.toLowerCase()) ?? 0, weight));
    }
    const top: { channel: SearchChannel; score: number }[] = [];
    for (const item of this.entries.values()) {
      const channel = this.fresh(item.channel, now);
      if (eligible && !eligible(channel)) continue;
      let base = relevance(channel.isLive === undefined ? { ...item, context: "" } : item, term);
      if (!base && upstream.has(channel.login)) base = 100;
      if (!base) continue;
      const exactName = base === 1000;
      const exactLogin = query.trim().replace(/^@/, "").toLowerCase() === channel.login;
      if (base === 1000 && !explicit) base -= ambiguity * 100;
      const viewers = Number.isFinite(channel.viewersCount) ? Math.max(0, channel.viewersCount!) : 0;
      const followers = channel.followerCount ?? 0;
      const nameFamily = base >= 800;
      const priorWeight = nameFamily ? 60 + ambiguity * 140 : 25;
      const popularity = Math.min(1, Math.log10(1 + followers) / 7) * priorWeight + (channel.isPartner ? 8 : 0);
      // A complete name for an established creator is stronger identity evidence
      // than an incidental exact login on a dormant, little-known account.
      const identity = exactName ? Math.min(1, followers / 100_000) * 120 : 0;
      const personal = Math.min(base >= 650 ? 160 : base >= 400 ? 80 : 20, affinity.get(channel.login) ?? 0);
      const score = base + popularity + identity + personal + (channel.isLive ? 6 : 0) + Math.min(10, Math.log10(1 + viewers) * 2)
        + (upstream.get(channel.login) ?? 0) + (explicit && exactLogin ? 1000 : 0);
      top.push({ channel, score });
      top.sort((a, b) => b.score - a.score || a.channel.login.localeCompare(b.channel.login));
      if (top.length > limit) top.pop();
    }
    return top.map(item => item.channel);
  }
}
