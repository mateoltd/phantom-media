import type { MediaType } from "./types";

/**
 * The catalog is keyed by IMDb id and the playback resolver is keyed by TMDB
 * id. Cinemeta usually carries both, so this only runs when it does not — or
 * when someone arrives with a pasted TMDB link. One SPARQL query per lookup,
 * asking for the other identifier directly rather than for the whole entity.
 */
const QUERY_BASE = "https://query.wikidata.org/sparql";
const USER_AGENT = "PhantomStream/1.0 (keyless identifier bridge)";

/** IMDb id, TMDB film id, TMDB series id. */
const IMDB = "P345";
const TMDB_BY_TYPE: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

async function lookup(
  fromProperty: string,
  value: string,
  toProperty: string,
): Promise<string | null> {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const url = new URL(QUERY_BASE);
  url.searchParams.set(
    "query",
    `SELECT ?other WHERE { ?item wdt:${fromProperty} "${escaped}". ?item wdt:${toProperty} ?other. } LIMIT 1`,
  );
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/sparql-results+json",
        "user-agent": USER_AGENT,
      },
      next: { revalidate: 604_800 },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: { bindings?: Array<{ other?: { value?: string } }> };
    };
    return payload.results?.bindings?.[0]?.other?.value?.trim() || null;
  } catch {
    return null;
  }
}

export async function tmdbToImdb(
  mediaType: MediaType,
  tmdbId: string,
): Promise<string | null> {
  const found = await lookup(TMDB_BY_TYPE[mediaType], tmdbId, IMDB);
  return found && /^tt\d{5,12}$/i.test(found) ? found.toLowerCase() : null;
}

export async function imdbToTmdb(
  mediaType: MediaType,
  imdbId: string,
): Promise<number | null> {
  const found = await lookup(IMDB, imdbId.toLowerCase(), TMDB_BY_TYPE[mediaType]);
  const numeric = Number(found);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}
