import type { MediaResult } from "./types";

export function posterUrl(media: MediaResult, size = "w500"): string | null {
  if (media.posterUrl) return media.posterUrl;
  if (media.posterPath) {
    return `https://image.tmdb.org/t/p/${size}${media.posterPath}`;
  }
  return null;
}

export function backdropUrl(media: MediaResult): string | null {
  if (media.backdropUrl) return media.backdropUrl;
  if (media.backdropPath) {
    return `https://image.tmdb.org/t/p/original${media.backdropPath}`;
  }
  return null;
}
