import type { MediaResult } from "./types";

const CINEMETA_BASE = "https://v3-cinemeta.strem.io/meta";

type CinemetaResponse = {
  meta?: {
    name?: string;
    description?: string;
    poster?: string;
    background?: string;
    genres?: string[];
    imdbRating?: string | number;
  };
};

function largerPoster(url: string): string {
  return url.replace("/poster/small/", "/poster/medium/");
}

async function enrichOne(media: MediaResult): Promise<MediaResult> {
  if (!media.imdbId) return media;
  const type = media.mediaType === "tv" ? "series" : "movie";

  try {
    const response = await fetch(
      `${CINEMETA_BASE}/${type}/${encodeURIComponent(media.imdbId)}.json`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "PhantomStream/0.1 (keyless artwork lookup)",
        },
        next: { revalidate: 86400 },
      },
    );
    if (!response.ok) return media;

    const payload = (await response.json()) as CinemetaResponse;
    const meta = payload.meta;
    if (!meta) return media;
    const rating = Number(meta.imdbRating);

    return {
      ...media,
      overview: media.overview || meta.description || "",
      posterUrl: meta.poster ? largerPoster(meta.poster) : media.posterUrl,
      backdropUrl: meta.background ?? media.backdropUrl,
      genres:
        Array.isArray(meta.genres) && meta.genres.length > 0
          ? meta.genres
          : media.genres,
      rating: Number.isFinite(rating) ? rating : media.rating,
    };
  } catch {
    return media;
  }
}

export async function enrichWithCinemeta(
  results: MediaResult[],
): Promise<MediaResult[]> {
  const enriched: MediaResult[] = [];
  const batchSize = 4;
  for (let index = 0; index < results.length; index += batchSize) {
    const batch = results.slice(index, index + batchSize);
    enriched.push(...(await Promise.all(batch.map(enrichOne))));
  }
  return enriched;
}
