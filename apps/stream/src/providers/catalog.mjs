
import {
  ACTIVE_SOURCE_IDS,
  CINESRC_SOURCE_ID,
  RELAY_SOURCE_IDS,
  STREMIO_ADDON_URLS,
  VIDEASY_SOURCE_ID,
  VIXSRC_SOURCE_ID,
  VIDZEE_SOURCE_ID,
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
  ...(ACTIVE_SOURCE_IDS.includes(CINESRC_SOURCE_ID)
    ? [
        Object.freeze({
          id: CINESRC_SOURCE_ID,
          kind: "cinesrc",
          deliveryMode: "resolver-full-relay",
          autoRace: true,
        }),
      ]
    : []),
  ...(ACTIVE_SOURCE_IDS.includes(VIXSRC_SOURCE_ID)
    ? [
        Object.freeze({
          id: VIXSRC_SOURCE_ID,
          kind: "vixsrc",
          deliveryMode: "native-direct",
          autoRace: true,
        }),
      ]
    : []),
  ...(ACTIVE_SOURCE_IDS.includes(VIDZEE_SOURCE_ID)
    ? [
        Object.freeze({
          id: VIDZEE_SOURCE_ID,
          kind: "vidzee",
          deliveryMode: "native-direct",
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
