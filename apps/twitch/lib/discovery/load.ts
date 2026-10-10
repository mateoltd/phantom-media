import { buildDiscoveryProfile, rankDiscovery, type DiscoveryPage, type DiscoveryHistory, type DiscoveryCandidate, type WatchedVideo, type ChannelDiscoveryData, type DiscoveryChannel } from "./ranking.ts";
import { UpstreamError } from "../errors.ts";
import { connectionChannels, directoryPage, fetchRecentChannels, fetchWatchedCategories, fetchCategoryCandidates, fetchRelatedCandidates, fetchExpansionCategory } from "../twitch/discovery.ts";
import { createDiscoveryContinuation, readDiscoveryContinuation } from "./continuation.ts";

async function expandDiscovery(cursor: string, languages: string[]): Promise<DiscoveryPage> {
  const plan = readDiscoveryContinuation(cursor, languages);
  const game = plan.games[0];
  const data = await fetchExpansionCategory(game);
  const channels = [...new Map(connectionChannels(data.game?.streams).filter((channel) => channel.stream).map((channel) => [channel.login.toLowerCase(), {
    ...channel, recommendation: { source: "category", reason: `${game}, from channels in your recent viewing` },
  }])).values()];
  const next = createDiscoveryContinuation(plan.games.slice(1), plan.languages, plan.expires);
  return { channels, ...(next ? { next } : {}) };
}

export async function fetchMoreChannelDiscovery(cursor: string, languages: string[]): Promise<DiscoveryPage> {
  // Only Still-owned category plans may continue. Twitch after-cursors are
  // rejected as invalid inputs before any upstream request.
  return expandDiscovery(cursor, languages);
}

export async function fetchChannelDiscovery(logins: string[], history: DiscoveryHistory[] = []): Promise<ChannelDiscoveryData> {
  const ids = [...new Set(history.flatMap((entry) => entry.vodId && /^\d{1,20}$/.test(entry.vodId) ? [entry.vodId] : []))].slice(0, 8);
  const [recentResult, videosResult] = await Promise.allSettled([
    logins.length ? fetchRecentChannels(logins) : Promise.resolve({ users: [] }),
    ids.length ? fetchWatchedCategories(ids) : Promise.resolve({}),
  ]);
  const users = recentResult.status === "fulfilled" ? recentResult.value.users.filter((user): user is DiscoveryChannel => Boolean(user)) : [];
  const recent = logins.flatMap((login) => users.find((channel) => channel.login.toLowerCase() === login) ?? []);
  const videos = videosResult.status === "fulfilled" ? Object.values(videosResult.value).filter((video): video is WatchedVideo => Boolean(video)) : [];
  const profile = buildDiscoveryProfile(history, recent, videos);
  const strongest = (map: Map<string, number>, limit: number) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key]) => key);
  const languages = strongest(profile.languages, 3).filter((language) => /^[a-z]{2}$/.test(language));
  const games = strongest(profile.games, 3);
  const seeds = strongest(profile.channels, 2);
  const [directoryResult, ...sourceResults] = await Promise.allSettled([
    directoryPage(languages),
    ...games.map((game) => fetchCategoryCandidates(game, languages)),
    ...seeds.map((seed) => fetchRelatedCandidates(seed)),
  ]);
  const discoveryResults = [directoryResult, ...sourceResults];
  if (discoveryResults.every((result) => result.status === "rejected")) {
    const failures = discoveryResults.flatMap((result) => result.status === "rejected" && result.reason instanceof UpstreamError ? [result.reason] : []);
    throw failures.find((error) => error.status === 429) ?? failures[0] ?? new UpstreamError("transport", 15);
  }
  const sourced = sourceResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const directory: DiscoveryCandidate[] = directoryResult.status === "fulfilled" ? connectionChannels(directoryResult.value.streams).map((channel) => ({ channel, source: "directory" })) : [];
  const excluded = [...new Set([...logins, ...history.map((entry) => entry.channel.toLowerCase())])];
  const sections: ChannelDiscoveryData["sections"] = [];
  const personalized = rankDiscovery([...sourced.filter(({ channel }) => channel.stream), ...(profile.channels.size ? directory : [])], profile, excluded, 20);
  if (personalized.length) sections.push({ type: "RECOMMENDED_SECTION", description: "Based on your recent viewing, watched categories and available Twitch channel connections.", channels: personalized });
  const used = [...excluded, ...personalized.map((channel) => channel.login)];
  const explore = rankDiscovery(directory, profile, used, 30);
  if (explore.length) sections.push({ type: "POPULAR_SECTION", description: languages.length ? `More live channels in ${languages.map((language) => new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language).join(", ")}, ranked for your interests.` : "Explore live channels across Twitch.", channels: explore });
  const offline = rankDiscovery(sourced.filter(({ channel }) => !channel.stream), profile, used.concat(explore.map((channel) => channel.login)), 12);
  if (offline.length) sections.push({ type: "OFFLINE_SECTION", description: "Channels with recent broadcasts in your categories, or a Twitch connection to channels you watch.", channels: offline });
  // Twitch's directory cursors require browser integrity. Expand only other known
  // interests through ordinary first-page category queries, then stop honestly.
  const extraGames = [...new Set([
    ...strongest(profile.games, 6),
    ...recent.flatMap((channel) => channel.stream?.game?.name ?? channel.broadcastSettings?.game?.name ?? []),
  ])].filter((game) => !games.includes(game)).slice(0, 6);
  const next = createDiscoveryContinuation(extraGames, languages);
  return { recent, sections, ...(next ? { next } : {}) };
}
