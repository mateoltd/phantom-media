/**
 * The relay, as a provider.
 *
 * All fourteen relay sources share one client, and therefore one response
 * cache and one view of which of them are cooling down. Handing each its own
 * would mean fourteen separate ideas of whether upstream is rate limiting,
 * which is the one thing it is most important to agree about.
 */

import { RelayClient } from "../relay-client.mjs";

const CLIENT_VERSION = 2;

/**
 * A module-scope singleton, kept across hot reloads in development so an edit
 * does not throw away a warm cache and re-provoke the rate limiter. In
 * production the isolate's lifetime is the cache's lifetime.
 */
function sharedClient() {
  const existing = globalThis.__phantomRelayClientState;
  if (existing?.version === CLIENT_VERSION) return existing.client;
  const client = new RelayClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__phantomRelayClientState = { version: CLIENT_VERSION, client };
  }
  return client;
}

export function createRelayResolver(id) {
  return async (media, options = {}) => {
    const client = sharedClient();
    const result = await client.resolveScraper(media, id, options);
    return {
      candidates: result.candidates,
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
