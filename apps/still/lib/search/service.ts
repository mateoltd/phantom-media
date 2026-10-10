import { ResourceCache } from "../cache.ts";
import { runQuery } from "../twitch/gql.ts";
import { channelIndex } from "./registry.ts";
import { observedChannel, type SearchChannel, type SearchIdentity } from "./contracts.ts";
import { UpstreamError } from "../errors.ts";
import { searchCandidates } from "./candidates.ts";
import { ChannelSearchIndex } from "./ranking.ts";
import { SEARCH_SEEDS } from "./seeds.ts";

const shelves = new ResourceCache<ReturnType<typeof channelIndex.snapshot>>(1);
type HydrationReceipt = { found: SearchChannel[]; missing: string[]; checkedAt: number };
const identities = new ResourceCache<HydrationReceipt>(32);
export function searchIndex(signal?: AbortSignal) {
  return shelves.load("identities", async () => {
    const logins = [...new Set(SEARCH_SEEDS.map(channel => channel.login))].slice(0, 100);
    try {
      const { found, missing, checkedAt } = await hydrateIdentities(logins);
      channelIndex.remove(missing, checkedAt); channelIndex.put(found);
    } catch { /* Existing observed channels remain useful during a warmup failure. */ }
    return channelIndex.snapshot();
  }, 60_000, signal);
}

/** Identity lookup complements discovery and preserves direct unknown usernames. */
async function hydrateIdentities(logins: string[], signal?: AbortSignal): Promise<HydrationReceipt> {
  if (!logins.length) return { found: [], missing: [], checkedAt: Date.now() };
  return identities.load(JSON.stringify(logins), async () => {
    // Cache the sampled receipt, not raw data that would acquire a new timestamp
    // on every read. Caller cancellation must not abort this shared hydration.
    const upstreamSignal = AbortSignal.timeout(1500);
    const read = (popularity: boolean) => runQuery<{ users: (SearchIdentity | null)[] }>(`query SearchChannels($logins: [String!]!) {
      users(logins:$logins) { id login displayName profileImageURL(width:150)
        ${popularity ? "followers { totalCount } roles { isPartner }" : ""}
        stream { title viewersCount game { name } } }
    }`, { logins }, { discovery: true, cache: false, timeoutMs: 1500, signal: upstreamSignal });
    const data = await read(true).catch(error => {
      // Ranking hints are optional; never retry integrity/transport failures.
      if (error instanceof UpstreamError && error.kind === "schema") return read(false);
      throw error;
    });
    if (!Array.isArray(data.users)) throw new UpstreamError("schema");
    const checkedAt = Date.now();
    const found = data.users.flatMap(channel => channel ? [observedChannel(channel, checkedAt)] : []);
    const returned = new Set(found.map(channel => channel.login));
    return { found, missing: logins.filter(login => !returned.has(login)), checkedAt };
  }, 30_000, signal);
}

/** Query-driven candidates arrive alongside one bounded exact/known identity read. */
export async function searchChannels(query: string, signal?: AbortSignal) {
  const term = query.trim().replace(/^@/, "").toLowerCase();
  const local = channelIndex.search(query);
  const exact = /^[a-z0-9_]{3,25}$/.test(term) ? term : undefined;
  const explicit = query.trim().startsWith("@");
  const logins = explicit && exact ? [exact] : [...new Set([...(exact ? [exact] : []), ...local.map(channel => channel.login)])].slice(0, 8);
  const [discovery, hydration] = await Promise.allSettled([
    explicit ? Promise.resolve({ channels: [], checkedAt: 0 }) : searchCandidates(term, signal),
    hydrateIdentities(logins, signal),
  ]);
  if (signal?.aborted) throw signal.reason;
  const matchedLogins = discovery.status === "fulfilled" ? discovery.value.channels.map(channel => channel.login) : [];
  const missing = hydration.status === "fulfilled" ? hydration.value.missing : [];
  const checkedAt = hydration.status === "fulfilled" ? hydration.value.checkedAt : discovery.status === "fulfilled" ? discovery.value.checkedAt : Date.now();
  if (discovery.status === "fulfilled") channelIndex.put(discovery.value.channels);
  if (hydration.status === "fulfilled") {
    channelIndex.remove(missing, checkedAt); channelIndex.put(hydration.value.found);
  }
  // Return the candidate pool, not just the server's top eight: private local
  // history may prefer a channel outside those eight. Do not send private visits.
  const pool = new ChannelSearchIndex(64);
  const wanted = new Set([...logins, ...matchedLogins]);
  pool.put(channelIndex.snapshot().filter(channel => wanted.has(channel.login)));
  const results = pool.search(query, [], 64, Date.now(), matchedLogins);
  if (!results.length) {
    if (discovery.status === "rejected") throw discovery.reason;
    if (hydration.status === "rejected") throw hydration.reason;
  }
  return { results, matchedLogins, missing, checkedAt };
}
