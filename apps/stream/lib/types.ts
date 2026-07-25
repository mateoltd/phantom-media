export type MediaType = "movie" | "tv";

export interface MediaResult {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  genreIds: number[];
  genres: string[];
  imdbId?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  dataSource?: "wikidata" | "tmdb" | "direct";
}

export interface SeasonSummary {
  id: number;
  name: string;
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
}

export interface EpisodeSummary {
  id: number;
  name: string;
  episodeNumber: number;
  seasonNumber: number;
  airDate: string | null;
  overview: string;
  stillPath: string | null;
  runtime: number | null;
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
