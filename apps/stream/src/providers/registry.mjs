
import { PROVIDER_CATALOG } from "./catalog.mjs";
import { createCineSrcResolver } from "./cinesrc.mjs";
import { createRelayResolver } from "./relay.mjs";
import { createStremioResolver } from "./stremio.mjs";
import { createVideasyResolver } from "./videasy.mjs";
import { createVidsrcResolver } from "./vidsrc.mjs";

const RESOLVERS = Object.freeze({
  relay: (descriptor) => createRelayResolver(descriptor.id),
  stremio: (descriptor) =>
    createStremioResolver(descriptor.id, {
      manifestUrl: descriptor.manifestUrl,
    }),
  vidsrc: (descriptor) => createVidsrcResolver(descriptor.id),
  videasy: (descriptor) => createVideasyResolver(descriptor.id),
  cinesrc: (descriptor) => createCineSrcResolver(descriptor.id),
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
      Object.freeze({ ...descriptor, resolve: factory(descriptor) }),
    ];
  }),
);

export function getProvider(id) {
  return PROVIDERS.get(id) ?? null;
}

export function listProviders() {
  return [...PROVIDERS.values()];
}
