
// Append only because each public alias and persisted score depends on its index.
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
  "t0",
  "t1",
  "t2",
  "n1",
  "r6",
  "m8",
  "d4",
  "w3",
  "g6",
  "x1",
  "j7",
  "c2",
  "l5",
  "u9",
]);

export const RETIRED_SOURCE_IDS = Object.freeze(
  new Set([
    // Duplicate of Source 03. Retained to preserve positional aliases.
    "p6",
    // Embed-only research targets. Retained so Source aliases never shift.
    "r6",
    "m8",
    "d4",
    "w3",
    "g6",
    "x1",
    "j7",
    "c2",
    "l5",
  ]),
);

export const RESERVED_SOURCE_IDS = Object.freeze(new Set());

export const STREMIO_SOURCE_IDS = Object.freeze(["t0", "t1", "t2"]);
export const VIDEASY_SOURCE_ID = "b5";
export const CINESRC_SOURCE_ID = "u9";
// Kept as a compatibility alias for persisted code that imports Source 28 by
// its previous implementation name.
export const VIDFAST_SOURCE_ID = CINESRC_SOURCE_ID;
export const NON_RELAY_SOURCE_IDS = Object.freeze([
  ...STREMIO_SOURCE_IDS,
  "n1",
  VIDEASY_SOURCE_ID,
  CINESRC_SOURCE_ID,
]);

const STREMIO_ENV_KEYS = Object.freeze([
  "STREMIO_ADDON_URL_1",
  "STREMIO_ADDON_URL_2",
  "STREMIO_ADDON_URL_3",
]);

export function parseStremioManifestUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("Stremio addon URLs must be valid HTTPS URLs");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/manifest.json")
  ) {
    throw new TypeError(
      "Stremio addon URLs must be public HTTPS manifest.json URLs without credentials, query strings, or fragments",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    !hostname.includes(".") ||
    /^\d+(?:\.\d+){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new TypeError("Stremio addon URLs must use a public DNS hostname");
  }
  return url.href;
}

export const STREMIO_ADDON_URLS = Object.freeze(
  Object.fromEntries(
    STREMIO_SOURCE_IDS.flatMap((id, index) => {
      const manifestUrl = parseStremioManifestUrl(
        process.env[STREMIO_ENV_KEYS[index]],
      );
      return manifestUrl ? [[id, manifestUrl]] : [];
    }).filter(
      ([, manifestUrl], index, entries) =>
        entries.findIndex(([, candidate]) => candidate === manifestUrl) ===
        index,
    ),
  ),
);

export const SOURCE_ALIASES = Object.freeze(
  Object.fromEntries(
    SOURCE_IDS.map((id, index) => [
      id,
      `Source ${String(index + 1).padStart(2, "0")}`,
    ]),
  ),
);

// Temporary two-provider roster while the native CineSrc and Videasy
// integrations are validated. Append-only aliases stay intact for rollback.
export const ACTIVE_SOURCE_IDS = Object.freeze([
  CINESRC_SOURCE_ID,
  VIDEASY_SOURCE_ID,
]);

export const AUTOMATIC_SOURCE_IDS = Object.freeze(
  ACTIVE_SOURCE_IDS,
);

export const RELAY_CAPABLE_SOURCE_IDS = Object.freeze(
  SOURCE_IDS.filter(
    (id) =>
      !NON_RELAY_SOURCE_IDS.includes(id) &&
      !RETIRED_SOURCE_IDS.has(id) &&
      !RESERVED_SOURCE_IDS.has(id),
  ),
);

export const RELAY_SOURCE_IDS = Object.freeze(
  ACTIVE_SOURCE_IDS.filter((id) => !NON_RELAY_SOURCE_IDS.includes(id)),
);

export function sourceAlias(id) {
  return SOURCE_ALIASES[id] ?? id;
}

export const SOURCE_ROSTER = Object.freeze(
  ACTIVE_SOURCE_IDS.map((id) =>
    Object.freeze({
      id,
      label: sourceAlias(id),
      automatic: true,
    }),
  ),
);
