import { runDiscoveryQuery } from "./gql.ts";
import type { DiscoveryCandidate, DiscoveryChannel, WatchedVideo } from "../discovery/ranking.ts";

const DISCOVERY_CHANNEL_FIELDS = `
  id login displayName profileImageURL(width: 150)
  broadcastSettings { language game { name boxArtURL(width: 192, height: 256) } }
  stream {
    title viewersCount broadcastLanguage previewImageURL(width: 640, height: 360)
    archiveVideo { id }
    game { name boxArtURL(width: 192, height: 256) }
  }
`;

interface PersonalSection {
  type: string;
  items: { user?: DiscoveryChannel | null }[];
}
interface DiscoveryConnection { edges: { cursor?: string; node: { broadcaster?: DiscoveryChannel | null } }[]; pageInfo?: { hasNextPage: boolean } }
export const connectionChannels = (connection?: DiscoveryConnection | null) =>
  connection?.edges.flatMap(({ node }) => node.broadcaster ? [node.broadcaster] : []) ?? [];

const DIRECTORY_QUERY = `query DiscoveryDirectory {
  streams(first: 30) { edges { node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } } }
}`;
export async function directoryPage(languages: string[]) {
  const data = await runDiscoveryQuery<{ streams?: DiscoveryConnection }>(DIRECTORY_QUERY);
  // Root streams has no language axis. Filter only this bounded returned shelf.
  return languages.length ? { streams: { ...data.streams, edges: data.streams?.edges.filter(({ node }) => languages.some(language => language.toLowerCase() === node.broadcaster?.stream?.broadcastLanguage?.toLowerCase())) ?? [] } } : data;
}
export function fetchRecentChannels(logins: string[]) {
  return runDiscoveryQuery<{ users: (DiscoveryChannel | null)[] }>(
      `query RecentChannels($logins: [String!]!) { users(logins: $logins) { ${DISCOVERY_CHANNEL_FIELDS} } }`, { logins });
}

export function fetchWatchedCategories(ids: string[]) {
  return runDiscoveryQuery<Record<string, WatchedVideo | null>>(`query WatchedCategories { ${ids.map((id, index) => `v${index}: video(id: "${id}") { id title game { name } owner { login } }`).join(" ")} }`);
}

export function fetchCategoryCandidates(game: string, languages: string[]) {
  return runDiscoveryQuery<{ game?: { streams?: DiscoveryConnection; videos?: { edges: { node: { owner?: DiscoveryChannel | null } }[] } } }>(`query DiscoveryCategory($game: String!, $languages: [String!]) {
      game(name: $game) {
        streams(first: 30) { edges { node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } } }
        videos(first: 8, languages: $languages, sort: TIME) { edges { node { owner { ${DISCOVERY_CHANNEL_FIELDS} } } } }
      }
    }`, { game, languages: languages[0] ? [languages[0].toLowerCase()] : null }).then((data): DiscoveryCandidate[] => [
      ...connectionChannels(data.game?.streams).map((channel) => ({ channel, source: "category" as const, game })),
      ...(data.game?.videos?.edges.flatMap(({ node }) => node.owner ? [{ channel: node.owner, source: "archive" as const, game }] : []) ?? []),
    ]);
}

export function fetchRelatedCandidates(seed: string) {
  return runDiscoveryQuery<{ personalSections?: PersonalSection[]; user?: { primaryTeam?: { members?: { edges: { node: DiscoveryChannel }[] } } } }>(`query RelatedChannels($channel: String!) {
      personalSections(input: { sectionInputs: [SIMILAR_SECTION], contextChannelName: $channel, recommendationContext: { platform: "web" } }) {
        type items { ... on PersonalSectionChannel { user { ${DISCOVERY_CHANNEL_FIELDS} } } }
      }
      user(login: $channel) { primaryTeam { members(first: 12) { edges { node { ${DISCOVERY_CHANNEL_FIELDS} } } } } }
    }`, { channel: seed }).then((data): DiscoveryCandidate[] => [
      // Anonymous responses frequently substitute POPULAR_SECTION. That is not a relationship.
      ...(data.personalSections?.filter((section) => section.type === "SIMILAR_SECTION").flatMap((section) => section.items.flatMap(({ user }) => user ? [{ channel: user, source: "similar" as const, seed }] : [])) ?? []),
      ...(data.user?.primaryTeam?.members?.edges.map(({ node }) => ({ channel: node, source: "team" as const, seed })) ?? []),
    ]);
}

export function fetchExpansionCategory(game: string) {
  return runDiscoveryQuery<{ game?: { streams?: DiscoveryConnection } }>(`query DiscoveryExpansionCategory($game: String!) {
    game(name: $game) { streams(first: 30) {
      edges { node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } }
    } }
  }`, { game });
}
