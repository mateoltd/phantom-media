import type { MediaResult, MediaType } from "./types";

export function mediaHref(media: Pick<MediaResult, "id" | "mediaType">): string {
  return `/watch/${media.mediaType}/${media.id}`;
}

export function kindLabel(mediaType: MediaType): string {
  return mediaType === "tv" ? "Series" : "Film";
}

/** `1:04:12` for anything an hour or longer, `4:12` below that. */
export function formatTimecode(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  const paddedSeconds = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

/**
 * Identifiers are handled differently from titles: they resolve to exactly one
 * work, so the app skips the results grid and opens it.
 */
export function looksLikeIdentifier(query: string): boolean {
  return (
    /tt\d{5,12}/i.test(query) ||
    /themoviedb\.org\/(movie|tv)\/\d+/i.test(query) ||
    /^(movie|tv)\s*[:/#-]\s*\d+$/i.test(query)
  );
}
