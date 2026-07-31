
import {
  ACTIVE_SOURCE_IDS,
  RELAY_SOURCE_IDS,
  STREMIO_ADDON_URLS,
  VIDEASY_SOURCE_ID,
  VIDFAST_SOURCE_ID,
  sourceAlias,
} from "../source-ids.mjs";
import {
  capacityDomainsFor,
  failureDomainFor,
} from "../failure-domain.mjs";
import { sourcePlaybackHints } from "../source-observations.mjs";

const DECLARED = Object.freeze([
  ...RELAY_SOURCE_IDS.map((id) =>
    Object.freeze({
      id,
      kind: "relay",
      deliveryMode: "resolver",
      autoRace: true,
    }),
  ),
  ...Object.entries(STREMIO_ADDON_URLS).map(([id, manifestUrl]) =>
    Object.freeze({
      id,
      kind: "stremio",
      deliveryMode: "native-direct",
      autoRace: true,
      manifestUrl,
    }),
  ),
  ...(ACTIVE_SOURCE_IDS.includes("n1")
    ? [
        Object.freeze({
          id: "n1",
          kind: "vidsrc",
          deliveryMode: "resolver-full-relay",
          autoRace: true,
        }),
      ]
    : []),
  ...(ACTIVE_SOURCE_IDS.includes(VIDEASY_SOURCE_ID)
    ? [
        Object.freeze({
          id: VIDEASY_SOURCE_ID,
          kind: "videasy",
          deliveryMode: "native-direct",
          autoRace: true,
        }),
      ]
    : []),
  ...(ACTIVE_SOURCE_IDS.includes(VIDFAST_SOURCE_ID)
    ? [
        Object.freeze({
          id: VIDFAST_SOURCE_ID,
          kind: "vidfast",
          deliveryMode: "resolver-full-relay",
          autoRace: true,
        }),
      ]
    : []),
]);

export const PROVIDER_CATALOG = Object.freeze(
  DECLARED.map((entry) =>
    Object.freeze({
      ...entry,
      label: sourceAlias(entry.id),
      failureDomain: failureDomainFor(entry.id),
      capacityDomains: capacityDomainsFor(entry.id),
      playbackHints: sourcePlaybackHints(entry.id),
    }),
  ),
);

export const PROVIDER_KINDS = Object.freeze([
  ...new Set(DECLARED.map((entry) => entry.kind)),
]);

const BY_ID = new Map(PROVIDER_CATALOG.map((entry) => [entry.id, entry]));

export function providerDescriptor(id) {
  return BY_ID.get(id) ?? null;
}
