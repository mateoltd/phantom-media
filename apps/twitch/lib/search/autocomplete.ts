import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { runPersisted } from "../twitch/gql.ts";
import { readSearchChannels } from "./contracts.ts";
import { channelIndex } from "./registry.ts";

export function parseAutocomplete(data: unknown, checkedAt: number) {
  const root = data as { searchSuggestions?: { edges?: { node?: { text?: unknown; content?: Record<string, unknown> | null } | null }[] } } | null;
  const edges = root?.searchSuggestions?.edges;
  if (!Array.isArray(edges)) throw new UpstreamError("schema");
  return readSearchChannels(edges.slice(0, 8).flatMap(edge => {
    const content = edge?.node?.content;
    if (content?.__typename !== "SearchSuggestionChannel" || typeof content.isLive !== "boolean") return [];
    return [{ login: content.login, displayName: edge.node?.text, profileImageURL: content.profileImageURL,
      isLive: content.isLive, isVerified: content.isVerified, verifiedObservedAt: checkedAt, observedAt: checkedAt }];
  }));
}
type Receipt = { results: ReturnType<typeof parseAutocomplete>; matchedLogins: string[]; missing: string[]; checkedAt: number };
const queries = new ResourceCache<Receipt>(64);

/** Native autocomplete supplies avatar/state directly, including offline users. */
export function autocompleteChannels(query: string, signal?: AbortSignal) {
  return queries.load(query, async () => {
    const checked = await runPersisted("SearchTray_SearchSuggestions", { queryFragment: query, withOfflineChannelContent: true, includeIsDJ: false }, data => {
      const checkedAt = Date.now();
      return { results: parseAutocomplete(data, checkedAt), checkedAt };
    }, { discovery: true, timeoutMs: 1000, signal: AbortSignal.timeout(1000) });
    channelIndex.put(checked.results);
    return { ...checked, matchedLogins: checked.results.map(channel => channel.login), missing: [] };
  }, 30_000, signal);
}
