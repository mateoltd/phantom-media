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

export const SOURCE_ALIASES = Object.freeze(
  Object.fromEntries(
    SOURCE_IDS.map((id, index) => [
      id,
      `Source ${String(index + 1).padStart(2, "0")}`,
    ]),
  ),
);

/** Falls back to the raw code so an unknown id can never render as blank. */
export function sourceAlias(id) {
  return SOURCE_ALIASES[id] ?? id;
}

export const SOURCE_ROSTER = Object.freeze(
  SOURCE_IDS.map((id) => Object.freeze({ id, label: sourceAlias(id) })),
);
