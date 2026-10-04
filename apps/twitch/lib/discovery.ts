export interface DiscoveryChannel {
  id: string;
  login: string;
  displayName: string;
  profileImageURL?: string;
  recommendation?: { reason: string; source: string; seed?: string };
  broadcastSettings?: { language?: string; game?: { name: string; boxArtURL?: string } | null } | null;
  stream?: {
    broadcastLanguage?: string;
    title: string;
    viewersCount: number;
    previewImageURL: string;
    archiveVideo?: { id: string } | null;
    game?: { name: string; boxArtURL?: string } | null;
  } | null;
}

export function historyPreview(entry: { vodId: string; previewThumbnailURL?: string }, channel?: DiscoveryChannel) {
  if (entry.previewThumbnailURL && !entry.previewThumbnailURL.includes("/_404/")) return entry.previewThumbnailURL;
  // A live preview is relevant only when this VOD is that stream's archive.
  if (channel?.stream?.archiveVideo?.id === entry.vodId) return channel.stream.previewImageURL;
  return undefined;
}

export interface DiscoverySection {
  type: string;
  description?: string;
  channels: DiscoveryChannel[];
}

export interface DiscoveryContinuation { cursor: string; languages: string[] }
export interface DiscoveryPage { channels: DiscoveryChannel[]; next?: DiscoveryContinuation }

export interface ChannelDiscoveryData {
  next?: DiscoveryContinuation;
  recent: DiscoveryChannel[];
  sections: DiscoverySection[];
}

export function recentChannelLogins(entries: { channel: string }[]): string[] {
  return [...new Set(entries.map(({ channel }) => channel.trim().toLowerCase()))]
    .filter((login) => /^[a-z0-9_]{3,25}$/.test(login)).slice(0, 6);
}

export function discoveryHeading(type: string, channel?: string) {
  if (type === "SIMILAR_SECTION" && channel) return `Suggested for ${channel}`;
  if (type === "RECOMMENDED_SECTION") return "Recommended channels";
  return "Popular live channels";
}

/** Round-robin categories so one event cannot occupy the whole first row. */
export function diverseChannels(channels: DiscoveryChannel[], excluded: string[] = [], limit = 24): DiscoveryChannel[] {
  const seen = new Set(excluded.map((login) => login.toLowerCase()));
  const groups = new Map<string, DiscoveryChannel[]>();
  for (const channel of channels) {
    const login = channel.login.toLowerCase();
    if (!channel.stream || seen.has(login)) continue;
    seen.add(login);
    const game = channel.stream.game?.name ?? "";
    if (!groups.has(game)) groups.set(game, []);
    groups.get(game)!.push(channel);
  }
  const result: DiscoveryChannel[] = [];
  while (result.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) { result.push(next); added = true; }
      if (result.length === limit) break;
    }
    if (!added) break;
  }
  return result;
}

export interface DiscoveryHistory {
  channel: string;
  vodId?: string;
  timestamp: number;
  title?: string;
}

/** Invalid advisory entries must never prevent discovery for the remaining history. */
export function parseDiscoveryHistory(value: unknown, now = Date.now()): DiscoveryHistory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((entry): DiscoveryHistory[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.channel !== "string" || !/^[a-z0-9_]{3,25}$/i.test(entry.channel)
      || typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp) || entry.timestamp < 0
      || (entry.vodId !== undefined && (typeof entry.vodId !== "string" || !/^\d{1,20}$/.test(entry.vodId)))
      || (entry.title !== undefined && (typeof entry.title !== "string" || entry.title.length > 500))) return [];
    return [{ channel: entry.channel.toLowerCase(), timestamp: Math.min(now, entry.timestamp), vodId: entry.vodId, title: entry.title }];
  }).sort((a, b) => b.timestamp - a.timestamp);
}
export interface WatchedVideo { id: string; title?: string; game?: { name: string } | null; owner?: { login: string } }
export interface DiscoveryProfile {
  channels: Map<string, number>;
  games: Map<string, number>;
  languages: Map<string, number>;
  topics: Map<string, number>;
}
const words = (value: string) => [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])]
  .filter((word) => !new Set(["with", "this", "that", "live", "stream", "para", "como", "today", "twitch", "watch", "https", "playing"]).has(word));
const add = (map: Map<string, number>, key: string | undefined, weight: number) => {
  if (key) map.set(key, (map.get(key) ?? 0) + weight);
};

/** Distinct VOD visits are evidence of interest, not a claim of minutes watched. */
export function buildDiscoveryProfile(history: DiscoveryHistory[], recent: DiscoveryChannel[], videos: WatchedVideo[] = [], now = Date.now()): DiscoveryProfile {
  const profile: DiscoveryProfile = { channels: new Map(), games: new Map(), languages: new Map(), topics: new Map() };
  const entries: DiscoveryHistory[] = history.length ? history : recent.map((channel, index) => ({ channel: channel.login, timestamp: now - index * 86_400_000 }));
  const seen = new Set<string>();
  for (const entry of entries.slice(0, 30)) {
    const login = entry.channel.toLowerCase();
    const key = `${login}:${entry.vodId ?? entry.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Seven-day half-life. Saturation keeps repeated visits from overwhelming variety.
    const weight = Math.pow(0.5, Math.max(0, now - entry.timestamp) / (7 * 86_400_000));
    add(profile.channels, login, weight);
    const channel = recent.find((item) => item.login.toLowerCase() === login);
    const video = videos.find((item) => item.id === entry.vodId && item.owner?.login.toLowerCase() === login);
    add(profile.games, video?.game?.name ?? channel?.stream?.game?.name ?? channel?.broadcastSettings?.game?.name, weight);
    add(profile.languages, (channel?.stream?.broadcastLanguage ?? channel?.broadcastSettings?.language)?.toLowerCase(), weight);
    for (const topic of words(video?.title ?? entry.title ?? "")) add(profile.topics, topic, weight);
  }
  for (const map of Object.values(profile) as Map<string, number>[]) {
    for (const [key, value] of map) map.set(key, Math.log1p(value));
    const max = Math.max(1, ...map.values());
    for (const [key, value] of map) map.set(key, value / max);
  }
  return profile;
}

export interface DiscoveryCandidate {
  channel: DiscoveryChannel;
  source: "similar" | "team" | "category" | "archive" | "directory";
  seed?: string;
  game?: string;
}

/** Relevance first, then greedy diversity across categories, seeds and channel sizes. */
export function rankDiscovery(candidates: DiscoveryCandidate[], profile: DiscoveryProfile, excluded: string[] = [], limit = 20): DiscoveryChannel[] {
  const blocked = new Set(excluded.map((login) => login.toLowerCase()));
  const scored = new Map<string, { channel: DiscoveryChannel; score: number; game: string; seed: string; size: string }>();
  for (const { channel, source, seed, game: sourceGame } of candidates) {
    const login = channel.login.toLowerCase();
    if (blocked.has(login)) continue;
    const game = channel.stream?.game?.name ?? sourceGame ?? channel.broadcastSettings?.game?.name ?? "";
    const language = (channel.stream?.broadcastLanguage ?? channel.broadcastSettings?.language ?? "").toLowerCase();
    // Broad conversational categories convey less taste than a specific game.
    const specificity = ["Just Chatting", "IRL", "Talk Shows & Podcasts", "Special Events"].includes(game) ? 0.55 : 1;
    const gameAffinity = (profile.games.get(game) ?? 0) * specificity;
    const languageAffinity = profile.languages.get(language) ?? 0;
    const seedAffinity = profile.channels.get(seed?.toLowerCase() ?? "") ?? 0;
    const topicAffinity = Math.min(1, words(channel.stream?.title ?? "").reduce((sum, word) => sum + (profile.topics.get(word) ?? 0), 0));
    const relationship = source === "similar" ? 3 + seedAffinity * 2 : source === "team" ? 2 + seedAffinity : 0;
    const score = gameAffinity * 4 + languageAffinity * 2 + topicAffinity * 1.5 + relationship + (channel.stream ? 0.6 : 0)
      - (profile.languages.size && language && !languageAffinity ? 3 : 0)
      + Math.min(1.2, Math.log10(1 + (channel.stream?.viewersCount ?? 0)) * 0.24);
    const reason = source === "similar" ? `Twitch suggests this channel for ${seed}`
      : source === "team" ? `On the same Twitch team as ${seed}`
      : source === "archive" ? `Recently streamed ${sourceGame ?? game}`
      : gameAffinity ? `${game}, from your recent viewing`
      : languageAffinity ? `Discover more ${new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language} streams` : "Popular across Twitch";
    const previous = scored.get(login);
    if (!previous || score > previous.score) scored.set(login, {
      channel: { ...channel, recommendation: { reason, source, ...(seed ? { seed } : {}) } }, score, game, seed: seed ?? "",
      size: (channel.stream?.viewersCount ?? 0) < 500 ? "small" : (channel.stream?.viewersCount ?? 0) < 5000 ? "medium" : "large",
    });
  }
  const selected: DiscoveryChannel[] = [];
  const games = new Map<string, number>();
  const seeds = new Map<string, number>();
  const sizes = new Map<string, number>();
  while (scored.size && selected.length < limit) {
    const next = [...scored.values()].sort((a, b) => {
      const adjusted = (item: typeof a) => item.score - (games.get(item.game) ?? 0) * 2 - (item.seed ? (seeds.get(item.seed) ?? 0) * 0.5 : 0) - (sizes.get(item.size) ?? 0) * 0.18;
      return adjusted(b) - adjusted(a) || a.channel.login.localeCompare(b.channel.login);
    })[0];
    selected.push(next.channel);
    scored.delete(next.channel.login.toLowerCase());
    add(games, next.game, 1); add(seeds, next.seed, 1); add(sizes, next.size, 1);
  }
  return selected;
}
