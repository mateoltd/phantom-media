/**
 * The roster of playback sources, and the only place their names are decided.
 *
 * Upstream identifies each one by a two-character code and labels it with a
 * third party's brand. Phantom keeps the codes (they are what the API needs)
 * and replaces the labels with fixed in-house aliases, so no third-party name
 * reaches a response body, a screen or a log line. The aliases are positional
 * and the order never changes, which keeps "Source 07" meaning the same thing
 * from one session to the next.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

export const SOURCE_IDS = Object.freeze([
  "q4",
  "k9",
  "va",
  "b5",
  "p6",
  "vf",
  "f8",
  "s3",
  "z2",
  "s7",
  "fc",
  "vc",
  "h0",
  "v2",
]);

/**
 * Sources that are no longer asked, by code and with the reason kept next to
 * it. Retiring is exclusion rather than deletion because the alias is the
 * index: dropping an entry from `SOURCE_IDS` would slide every source after it
 * up a number, so a persisted score, a support conversation and a debug log
 * from last week would all quietly start meaning a different host.
 *
 * The codes stay in the roster above forever. This set is what shrinks.
 */
export const RETIRED_SOURCE_IDS = Object.freeze(
  new Set([
    // Serves an Indian catalogue — its origins behind the relay's proxy are
    // multimovies hosts, which carry Hindi dubs of non-Indian titles.
    "q4",
  ]),
);

export const SOURCE_ALIASES = Object.freeze(
  Object.fromEntries(
    SOURCE_IDS.map((id, index) => [
      id,
      `Source ${String(index + 1).padStart(2, "0")}`,
    ]),
  ),
);

/**
 * The sources actually asked. Everything downstream — the roster the watch
 * page renders, the provider catalog, what the API route accepts — is built
 * from this, so retiring one is the single edit above.
 */
export const ACTIVE_SOURCE_IDS = Object.freeze(
  SOURCE_IDS.filter((id) => !RETIRED_SOURCE_IDS.has(id)),
);

/** Falls back to the raw code so an unknown id can never render as blank. */
export function sourceAlias(id) {
  return SOURCE_ALIASES[id] ?? id;
}

export const SOURCE_ROSTER = Object.freeze(
  ACTIVE_SOURCE_IDS.map((id) => Object.freeze({ id, label: sourceAlias(id) })),
);
