import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { runQuery } from "../twitch/gql.ts";
import { observedChannel, readSearchChannels, type SearchIdentity } from "./contracts.ts";

export const SEARCH_CANDIDATE_LIMIT = 40;
export const SEARCH_CANDIDATES_QUERY = `query SearchCandidates($query: String!) {
  searchFor(userQuery: $query, platform: "web", options: { targets: [{ index: CHANNEL, limit: 40 }] }) {
    channels { edges { item { ... on User {
      id login displayName profileImageURL(width:150)
      followers { totalCount } roles { isPartner }
      stream { title viewersCount game { name } }
    } } } }
  }
}`;

/** Missing/null shelves are failures, not proof that a query has no matches. */
export function parseCandidates(data: unknown, checkedAt: number) {
  const root = data as { searchFor?: { channels?: { edges?: { item?: SearchIdentity | null }[] } } } | null;
  const edges = root?.searchFor?.channels?.edges;
  if (!Array.isArray(edges)) throw new UpstreamError("schema");
  const channels = readSearchChannels(edges.slice(0, SEARCH_CANDIDATE_LIMIT).flatMap(edge => {
    const item = edge?.item;
    return item && typeof item === "object" ? [observedChannel(item, checkedAt)] : [];
  }));
  return [...new Map(channels.map(channel => [channel.login, channel])).values()];
}

type CandidateReceipt = { channels: ReturnType<typeof parseCandidates>; checkedAt: number };
const queries = new ResourceCache<CandidateReceipt>(32);

/** One first-page query; no cursors, guessed-name expansion or identity challenge. */
export function searchCandidates(query: string, signal?: AbortSignal) {
  return queries.load(query, async () => {
    const data = await runQuery(SEARCH_CANDIDATES_QUERY, { query }, { discovery: true, cache: false, timeoutMs: 1500, signal: AbortSignal.timeout(1500) });
    const checkedAt = Date.now();
    return { channels: parseCandidates(data, checkedAt), checkedAt };
  }, 30_000, signal);
}
