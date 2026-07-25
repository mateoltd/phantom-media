export type MediaType = "movie" | "tv";

export interface MediaResult {
  /** What `/watch/:type/:id` carries: an IMDb id when there is one. */
  id: string;
  imdbId: string | null;
  /** The playback resolver speaks TMDB and nothing else. */
  tmdbId: number | null;
  mediaType: MediaType;
  title: string;
  /** `2011`, or `2011–2019` for a series that has finished. */
  year: string;
  releaseDate: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  rating: number;
  genres: string[];
  runtime: string | null;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

export interface EpisodeSummary {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  stillUrl: string | null;
}

export interface StreamCandidate {
  id: string;
  server: string;
  serverLabel: string;
  provider?: string;
  providerLabel?: string;
  url: string;
  type: "hls" | "mp4" | "dash" | "unknown";
  declaredType: string | null;
  resolution: number | null;
  format: string | null;
  size: number | string | null;
  score: number;
}

/**
 * Every field is optional because the shape varies by where the track came
 * from: a playback source describes them one way, a subtitle catalogue
 * another. `captionUrl` and `captionLabel` in `lib/subtitles.ts` are what turn
 * this into something the player can use.
 */
export interface SubtitleTrack {
  id?: string;
  display?: string;
  label?: string;
  file?: string;
  url?: string;
  lang?: string;
  language?: string;
  /** Where the track was found. Catalogues are named; playback sources are not. */
  origin?: "source" | "opensubtitles";
  /** Upstream's word for the encoding, so the proxy can decode it correctly. */
  encoding?: string;
  hearingImpaired?: boolean;
}

export interface ResolverResponse {
  server: string;
  serverLabel: string;
  latencyMs: number;
  candidates: StreamCandidate[];
  subtitles: SubtitleTrack[];
}
