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

export interface SubtitleTrack {
  id?: string;
  display?: string;
  label?: string;
  file?: string;
  url?: string;
  lang?: string;
  language?: string;
}

export interface ResolverResponse {
  server: string;
  serverLabel: string;
  latencyMs: number;
  attemptedServers?: string[];
  candidates: StreamCandidate[];
  subtitles: SubtitleTrack[];
  dubs: Array<Record<string, unknown>>;
  fallback: unknown;
}
