import {
  compareTracks,
  languageName,
  normalizeLanguage,
} from "../src/subtitles.mjs";
import type { MediaType, SubtitleTrack } from "./types";

export { compareTracks, languageName, normalizeLanguage };

/**
 * Where subtitles come from when a playback source has none of its own.
 *
 * OpenSubtitles is credited by name here and in the footer, the same as
 * Cinemeta and Wikidata: a catalogue that supplies work has its attribution
 * owed to it. Playback sources are the ones that stay anonymous.
 *
 * This particular endpoint needs no key and no account, which matters because
 * OpenSubtitles' own API allows a free account somewhere between five and
 * twenty downloads a day — unusable for anything anyone would actually watch.
 */
export const SUBTITLE_CATALOG = "https://opensubtitles-v3.strem.io";

/** The catalogue serves its files from here, and this is the only host the
 *  proxy will fetch from. */
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

/** The address of a track, whichever of the two names upstream used for it. */
export function captionUrl(track: SubtitleTrack): string | null {
  return track.url ?? track.file ?? null;
}

export function captionLanguage(track: SubtitleTrack): string {
  return normalizeLanguage(track.lang ?? track.language);
}

/**
 * What a track is called in the menu. Language first because that is what
 * anyone is scanning for; anything the catalogue added — a release name, a
 * hearing-impaired marker — is detail underneath.
 */
export function captionLabel(track: SubtitleTrack): string {
  const language = languageName(track.lang ?? track.language);
  return track.hearingImpaired ? `${language} (SDH)` : language;
}

export function captionDetail(track: SubtitleTrack): string | undefined {
  const named = track.display || track.label;
  if (named && named !== captionLabel(track)) return named;
  return track.origin === "source" ? "from this source" : undefined;
}

/**
 * Everything goes through the proxy, including tracks a playback source
 * supplied. A `<track>` on a `crossOrigin="anonymous"` video fails silently
 * against any host that does not send CORS headers, which is most of them, and
 * silently is the worst way for a subtitle to fail — the menu offers it, the
 * viewer picks it, and nothing happens.
 */
export function proxiedCaptionUrl(track: SubtitleTrack): string | null {
  const url = captionUrl(track);
  if (!url) return null;
  const params = new URLSearchParams({ url });
  if (track.encoding) params.set("encoding", track.encoding);
  return `/api/subtitles/file?${params}`;
}

export interface CaptionOption {
  /** Index into the rendered track list. */
  index: number;
  label: string;
  detail?: string;
  language: string;
}

/**
 * Merges what the playback source offered with what the catalogue found,
 * drops anything with no address, and puts them in an order a person can use.
 * A hundred and twenty tracks in arrival order is not a menu.
 */
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
