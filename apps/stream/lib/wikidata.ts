import type { MediaResult, MediaType } from "./types";

const API_BASE = "https://www.wikidata.org/w/api.php";
const QUERY_BASE = "https://query.wikidata.org/sparql";
const USER_AGENT = "PhantomStream/0.1 (keyless media discovery)";

type Claim = {
  rank?: string;
  mainsnak?: {
    datavalue?: {
      value?: unknown;
    };
  };
};

type Entity = {
  id: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Claim[]>;
};

type EntityResponse = {
  entities?: Record<string, Entity>;
};

function stringClaim(entity: Entity, property: string): string | null {
  const claims = entity.claims?.[property] ?? [];
  const preferred =
    claims.find((claim) => claim.rank === "preferred") ??
    claims.find((claim) => claim.rank !== "deprecated");
  const value = preferred?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? value : null;
}

function dateClaim(entity: Entity): string {
  const claims = entity.claims?.P577 ?? [];
  const claim =
    claims.find((item) => item.rank === "preferred") ??
    claims.find((item) => item.rank !== "deprecated");
  const value = claim?.mainsnak?.datavalue?.value;
  if (
    !value ||
    typeof value !== "object" ||
    !("time" in value) ||
    typeof value.time !== "string"
  ) {
    return "";
  }
  return value.time.replace(/^\+/, "").slice(0, 10);
}

function commonsImageUrl(filename: string | null): string | null {
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=500`;
}

function entityToMedia(entity: Entity): MediaResult | null {
  const movieId = stringClaim(entity, "P4947");
  const tvId = stringClaim(entity, "P4983");
  const mediaType: MediaType | null = movieId ? "movie" : tvId ? "tv" : null;
  const id = Number(movieId ?? tvId);
  const title = entity.labels?.en?.value?.trim();
  if (!mediaType || !Number.isSafeInteger(id) || id <= 0 || !title) return null;

  const releaseDate = dateClaim(entity);
  return {
    id,
    mediaType,
    title,
    originalTitle: title,
    overview: entity.descriptions?.en?.value ?? "",
    posterPath: null,
    backdropPath: null,
    releaseDate,
    year: releaseDate.slice(0, 4),
    rating: 0,
    genreIds: [],
    genres: [],
    imdbId: stringClaim(entity, "P345"),
    posterUrl: commonsImageUrl(stringClaim(entity, "P18")),
    backdropUrl: null,
    dataSource: "wikidata",
  };
}

async function wikidataFetch<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept:
        url.hostname === "query.wikidata.org"
          ? "application/sparql-results+json"
          : "application/json",
      "user-agent": USER_AGENT,
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    throw new Error(`Open catalog returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function getEntities(ids: string[]): Promise<Entity[]> {
  if (ids.length === 0) return [];
  const url = new URL(API_BASE);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("props", "labels|descriptions|claims");
  url.searchParams.set("languages", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const data = await wikidataFetch<EntityResponse>(url);
  return ids
    .map((id) => data.entities?.[id])
    .filter((entity): entity is Entity => Boolean(entity));
}

export async function searchOpenCatalog(query: string): Promise<MediaResult[]> {
  const url = new URL(API_BASE);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("uselang", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "24");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const data = await wikidataFetch<{
    search?: Array<{ id?: string }>;
  }>(url);
  const ids = (data.search ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));
  const entities = await getEntities(ids);
  return entities
    .map(entityToMedia)
    .filter((media): media is MediaResult => Boolean(media))
    .slice(0, 18);
}

async function findEntityIdsByProperty(
  property: "P345" | "P4947" | "P4983",
  value: string,
): Promise<string[]> {
  const url = new URL(QUERY_BASE);
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  url.searchParams.set(
    "query",
    `SELECT DISTINCT ?item WHERE { ?item wdt:${property} "${escaped}". } LIMIT 12`,
  );
  url.searchParams.set("format", "json");
  const data = await wikidataFetch<{
    results?: {
      bindings?: Array<{ item?: { value?: string } }>;
    };
  }>(url);
  return (data.results?.bindings ?? [])
    .map((binding) => binding.item?.value?.match(/\/(Q\d+)$/)?.[1])
    .filter((id): id is string => Boolean(id));
}

export async function findByImdb(imdbId: string): Promise<MediaResult[]> {
  const entities = await getEntities(
    await findEntityIdsByProperty("P345", imdbId),
  );
  return entities
    .map(entityToMedia)
    .filter((media): media is MediaResult => Boolean(media));
}

export async function findByTmdb(
  type: MediaType,
  id: string,
): Promise<MediaResult | null> {
  const property = type === "movie" ? "P4947" : "P4983";
  const entities = await getEntities(
    await findEntityIdsByProperty(property, id),
  );
  return (
    entities
      .map(entityToMedia)
      .find((media): media is MediaResult => Boolean(media)) ?? null
  );
}

export function directMedia(type: MediaType, id: string): MediaResult {
  const numericId = Number(id);
  return {
    id: numericId,
    mediaType: type,
    title: `${type === "movie" ? "Movie" : "Series"} #${numericId}`,
    originalTitle: "",
    overview: "Direct TMDB identifier. Metadata was not present in the open catalog.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "",
    year: "",
    rating: 0,
    genreIds: [],
    genres: [],
    imdbId: null,
    posterUrl: null,
    backdropUrl: null,
    dataSource: "direct",
  };
}
