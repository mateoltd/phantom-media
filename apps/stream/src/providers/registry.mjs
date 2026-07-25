/**
 * Turns the catalog into things that can actually be asked for a stream.
 *
 * Resolvers are keyed by kind rather than by id, so another fourteen sources
 * of a kind that already works cost nothing here. A descriptor naming a kind
 * with no resolver behind it fails at module load rather than quietly 404-ing
 * one source in production, which is the kind of mistake worth making loud.
 *
 * The whole contract a new provider has to meet:
 *
 *   async (media, { signal, fresh }) => ({
 *     candidates: normalizeVariants(rawVariants, id),
 *     subtitles: SubtitleTrack[],
 *     latencyMs: number,
 *   })
 *
 * Errors throw something shaped like a RelayError: `{ status, retryable,
 * retryAfterMs }`. A provider never names itself, never scores itself, and
 * never mints a candidate by hand — `normalizeVariants` is what stamps
 * identity, and going around it is how a third party's brand would leak.
 */

import { PROVIDER_CATALOG } from "./catalog.mjs";
import { createRelayResolver } from "./relay.mjs";

const RESOLVERS = Object.freeze({
  relay: createRelayResolver,
});

const PROVIDERS = new Map(
  PROVIDER_CATALOG.map((descriptor) => {
    const factory = RESOLVERS[descriptor.kind];
    if (!factory) {
      throw new TypeError(
        `No resolver is registered for provider kind "${descriptor.kind}"`,
      );
    }
    return [
      descriptor.id,
      Object.freeze({ ...descriptor, resolve: factory(descriptor.id) }),
    ];
  }),
);

export function getProvider(id) {
  return PROVIDERS.get(id) ?? null;
}

export function listProviders() {
  return [...PROVIDERS.values()];
}
