import type {
  EpisodeSummary,
  MediaResult,
  MediaType,
  SeasonSummary,
} from "./types";

/**
 * Cinemeta is the whole catalog: one request answers a search, and one more
 * returns everything a title needs — artwork, rating, the TMDB id the playback
 * resolver speaks, and the full episode listing. The identifier bridge in
 * `id-bridge.ts` is only for the case someone arrives with a TMDB id instead.
 */
const CINEMETA = "https://v3-cinemeta.strem.io";
const USER_AGENT = "PhantomStream/1.0 (keyless catalog lookup)";

const CATALOG_TYPE: Record<MediaType, string> = {
  movie: "movie",
  tv: "series",
};

interface CinemetaMeta {
  id?: string;
  imdb_id?: string;
  moviedb_id?: string | number;
  type?: string;
  name?: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  genres?: string[];
  genre?: string[];
  imdbRating?: string | number;
  released?: string;
  releaseInfo?: string;
  year?: string;
  runtime?: string;
  videos?: CinemetaVideo[];
}

interface CinemetaVideo {
  id?: string;
  name?: string;
  title?: string;
  season?: number;
  episode?: number;
  number?: number;
  overview?: string;
  description?: string;
  thumbnail?: string;
  released?: string;
  firstAired?: string;
}

export interface TitleDetail {
  media: MediaResult;
  seasons: SeasonSummary[];
  episodes: EpisodeSummary[];
}

export const IMDB_ID_PATTERN = /^tt\d{5,12}$/i;

async function cinemeta<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(`${CINEMETA}${path}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      next: { revalidate },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Metahub serves the same artwork at several sizes; the small one is thumbnail-grade. */
function upscale(url: string | undefined, size: "medium" | "large"): string | null {
  if (!url) return null;
  return url.replace("/poster/small/", `/poster/${size}/`);
}

function toYear(meta: CinemetaMeta): string {
  const raw = (meta.releaseInfo || meta.year || "").trim();
  if (raw) {
    // A finished series reads `2011–2019`; an ongoing one reads `2011–`.
    return raw.replace(/[–-]\s*$/, "");
  }
  return meta.released?.slice(0, 4) ?? "";
}

function toMedia(meta: CinemetaMeta, mediaType: MediaType): MediaResult | null {
  const imdbId = (meta.imdb_id || meta.id || "").trim();
  const title = meta.name?.trim();
  if (!title || !IMDB_ID_PATTERN.test(imdbId)) return null;

  const tmdbId = Number(meta.moviedb_id);
  const rating = Number(meta.imdbRating);

  return {
    id: imdbId.toLowerCase(),
    imdbId: imdbId.toLowerCase(),
    tmdbId: Number.isSafeInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
    mediaType,
    title,
    year: toYear(meta),
    releaseDate: meta.released?.slice(0, 10) ?? "",
    overview: meta.description?.trim() ?? "",
    posterUrl: upscale(meta.poster, "medium"),
    backdropUrl: meta.background ?? null,
    logoUrl: meta.logo ?? null,
    rating: Number.isFinite(rating) ? rating : 0,
    genres: meta.genres ?? meta.genre ?? [],
    runtime: meta.runtime?.trim() || null,
  };
}

/**
 * Films and series are searched separately, so the merge has to decide which
 * list leads. Two things settle it: an exact title beats the substring matches
 * around it, and the catalog's own `rank` for the query says which type it
 * thinks was meant — `suits` scores 7.5 as a series and 5.6 as a film, which
 * is the difference between finding the show and finding a 1999 film nobody
 * was looking for.
 */
function relevance(
  media: MediaResult,
  query: string,
  position: number,
  listRank: number,
): number {
  const title = media.title.toLowerCase();
  const target = query.trim().toLowerCase();
  let score = 100 - position * 3 + listRank * 8;
  if (title === target) score += 120;
  else if (title.startsWith(target)) score += 45;
  if (media.posterUrl) score += 6;
  if (media.year) score += 4;
  return score;
}

export async function searchCatalog(query: string): Promise<MediaResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const encoded = encodeURIComponent(trimmed);

  const lists = await Promise.all(
    (["movie", "tv"] as const).map(async (mediaType) => {
      const payload = await cinemeta<{ metas?: CinemetaMeta[]; rank?: number }>(
        `/catalog/${CATALOG_TYPE[mediaType]}/top/search=${encoded}.json`,
        3_600,
      );
      return {
        rank: Number(payload?.rank) || 0,
        items: (payload?.metas ?? [])
          .map((meta) => toMedia(meta, mediaType))
          .filter((media): media is MediaResult => Boolean(media)),
      };
    }),
  );

  // Each list is scored against its own position, so a film ranked first is
  // weighed against the first series rather than against the whole merge.
  const seen = new Set<string>();
  return lists
    .flatMap((list) =>
      list.items.map((media, position) => ({
        media,
        score: relevance(media, trimmed, position, list.rank),
      })),
    )
    .sort((left, right) => right.score - left.score)
    .filter(({ media }) => {
      const key = `${media.mediaType}:${media.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ media }) => media)
    .slice(0, 24);
}

function toEpisodes(videos: CinemetaVideo[]): EpisodeSummary[] {
  return videos
    .map((video) => {
      const seasonNumber = Number(video.season);
      const episodeNumber = Number(video.episode ?? video.number);
      if (
        !Number.isSafeInteger(seasonNumber) ||
        !Number.isSafeInteger(episodeNumber) ||
        seasonNumber < 0 ||
        episodeNumber <= 0
      ) {
        return null;
      }
      return {
        seasonNumber,
        episodeNumber,
        name: (video.name || video.title || "").trim() || `Episode ${episodeNumber}`,
        overview: (video.overview || video.description || "").trim(),
        airDate: (video.released || video.firstAired || "").slice(0, 10) || null,
        stillUrl: video.thumbnail ?? null,
      };
    })
    .filter((episode): episode is EpisodeSummary => Boolean(episode))
    .sort(
      (left, right) =>
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber,
    );
}

function toSeasons(episodes: EpisodeSummary[]): SeasonSummary[] {
  const counts = new Map<number, EpisodeSummary[]>();
  for (const episode of episodes) {
    const existing = counts.get(episode.seasonNumber);
    if (existing) existing.push(episode);
    else counts.set(episode.seasonNumber, [episode]);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([seasonNumber, items]) => ({
      seasonNumber,
      name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
      episodeCount: items.length,
      airDate: items[0]?.airDate ?? null,
    }));
}

export async function getTitle(
  mediaType: MediaType,
  imdbId: string,
): Promise<TitleDetail | null> {
  if (!IMDB_ID_PATTERN.test(imdbId)) return null;
  const payload = await cinemeta<{ meta?: CinemetaMeta }>(
    `/meta/${CATALOG_TYPE[mediaType]}/${encodeURIComponent(imdbId.toLowerCase())}.json`,
    86_400,
  );
  const meta = payload?.meta;
  if (!meta) return null;

  const media = toMedia(meta, mediaType);
  if (!media) return null;

  const episodes = mediaType === "tv" ? toEpisodes(meta.videos ?? []) : [];
  return { media, seasons: toSeasons(episodes), episodes };
}

/** Everything a title needs when nothing but its identifiers are known. */
export function placeholderTitle(
  mediaType: MediaType,
  ids: { imdbId?: string | null; tmdbId?: number | null },
): MediaResult {
  return {
    id: ids.imdbId ?? String(ids.tmdbId ?? ""),
    imdbId: ids.imdbId ?? null,
    tmdbId: ids.tmdbId ?? null,
    mediaType,
    title: mediaType === "tv" ? "Untitled series" : "Untitled film",
    year: "",
    releaseDate: "",
    overview: "",
    posterUrl: null,
    backdropUrl: null,
    logoUrl: null,
    rating: 0,
    genres: [],
    runtime: null,
  };
}
