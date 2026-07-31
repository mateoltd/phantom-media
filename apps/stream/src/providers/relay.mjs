
import { RelayClient } from "../relay-client.mjs";
import { proxyWrapperCandidate } from "./wrapper-media-proxy.mjs";

const CLIENT_VERSION = 4;

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
    const candidates = options.proxyOrigin
      ? result.candidates.map((candidate) =>
          proxyWrapperCandidate(candidate, options.proxyOrigin),
        )
      : result.candidates;
    return {
      candidates,
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
