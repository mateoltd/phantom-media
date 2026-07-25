/**
 * Which playback sources exist, and what kind of thing each one is.
 *
 * This is the file to edit when a source is added. Everything else — the
 * alias, the registry entry, the roster the watch page renders, what the API
 * route will accept — follows from it, so adding another scraper of the kind
 * already supported costs one line in `source-ids.mjs` and nothing here.
 *
 * Labels are never declared alongside the id: they come from `sourceAlias`,
 * which is the only place a source's public name is decided.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

import { SOURCE_IDS, sourceAlias } from "../source-ids.mjs";

/**
 * The relay speaks to all fourteen of these the same way, so they share a
 * kind. A source reached some other way declares its own, and a resolver for
 * that kind has to exist in the registry or nothing starts.
 */
const DECLARED = Object.freeze([
  ...SOURCE_IDS.map((id) => Object.freeze({ id, kind: "relay" })),
]);

export const PROVIDER_CATALOG = Object.freeze(
  DECLARED.map(({ id, kind }) =>
    Object.freeze({ id, kind, label: sourceAlias(id) }),
  ),
);

export const PROVIDER_KINDS = Object.freeze([
  ...new Set(DECLARED.map((entry) => entry.kind)),
]);

const BY_ID = new Map(PROVIDER_CATALOG.map((entry) => [entry.id, entry]));

export function providerDescriptor(id) {
  return BY_ID.get(id) ?? null;
}
