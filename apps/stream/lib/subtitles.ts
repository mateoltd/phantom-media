import {
  compareTracks,
  languageName,
  normalizeLanguage,
} from "../src/subtitles.mjs";
import type { MediaType, SubtitleTrack } from "./types";

export { compareTracks, languageName, normalizeLanguage };

export const SUBTITLE_CATALOG = "https://opensubtitles-v3.strem.io";

export const SUBTITLE_FILE_HOST_SUFFIX = ".strem.io";

export interface SubtitleCatalogEntry {
  id?: string;
  url?: string;
  lang?: string;
  SubEncoding?: string;
}

export function catalogUrl(
  mediaType: MediaType,
  imdbId: string,
  season?: number,
  episode?: number,
): string {
  const kind = mediaType === "tv" ? "series" : "movie";
  const id =
    mediaType === "tv" && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;
  return `${SUBTITLE_CATALOG}/subtitles/${kind}/${encodeURIComponent(id)}.json`;
}

export function captionUrl(track: SubtitleTrack): string | null {
  return track.url ?? track.file ?? null;
}

export function captionLanguage(track: SubtitleTrack): string {
  return normalizeLanguage(track.lang ?? track.language);
}

export function captionLabel(track: SubtitleTrack): string {
  const language = languageName(track.lang ?? track.language);
  return track.hearingImpaired ? `${language} (SDH)` : language;
}

export function captionDetail(track: SubtitleTrack): string | undefined {
  const named = track.display || track.label;
  if (named && named !== captionLabel(track)) return named;
  return track.origin === "source" ? "from this source" : undefined;
}

export function proxiedCaptionUrl(track: SubtitleTrack): string | null {
  const url = captionUrl(track);
  if (!url) return null;
  if (url.startsWith("/api/sources/vidfast/proxy?")) return url;
  const params = new URLSearchParams({ url });
  if (track.encoding) params.set("encoding", track.encoding);
  return `/api/subtitles/file?${params}`;
}

export interface CaptionOption {
  index: number;
  label: string;
  detail?: string;
  language: string;
}

export function mergeTracks(
  fromSource: readonly SubtitleTrack[],
  fromCatalog: readonly SubtitleTrack[],
  preferred: readonly string[] = [],
): SubtitleTrack[] {
  const seen = new Set<string>();
  const merged: Array<SubtitleTrack & { rank: number }> = [];

  [...fromSource, ...fromCatalog].forEach((track, rank) => {
    const url = captionUrl(track);
    if (!url || seen.has(url)) return;
    seen.add(url);
    merged.push({ ...track, rank });
  });

  return merged.sort((left, right) => compareTracks(left, right, preferred));
}
