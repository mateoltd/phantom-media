export type MediaType = "movie" | "tv";

export interface MediaResult {
  id: string;
  imdbId: string | null;
  tmdbId: number | null;
  mediaType: MediaType;
  title: string;
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
  failureDomain?: string | null;
  capacityDomains?: readonly string[];
  playbackHints?: SourcePlaybackHints | null;
  deliveryMode?:
    | "native-direct"
    | "resolver"
    | "resolver-full-relay";
  embeddedAudioLanguage?: "en";
  expiresAt?: number | null;
  audioTracks?: readonly AudioTrack[];
  audioLanguages?: readonly string[];
  language?: string;
  lang?: string;
}

export type PlaybackHintConfidence = "unknown" | "low" | "medium" | "high";

export interface PlaybackLanguageObservation {
  status: "unknown" | "observed" | "none" | "present";
  languages: readonly string[];
  confidence: PlaybackHintConfidence;
}

export interface PlaybackObservationNote {
  kind: "audio" | "burned-in-subtitles" | "video" | "performance";
  languages: readonly string[];
  confidence: PlaybackHintConfidence;
  observedAt: string;
  evidence: "user-report" | "user-screenshot" | "provider-lab";
  text: string;
}

export interface PlaybackVideoObservation {
  adaptive: boolean | null;
  maxResolution: number | null;
  typicalResolution: number | null;
  confidence: PlaybackHintConfidence;
}

export interface PlaybackPerformanceObservation {
  status: "unknown" | "slow" | "fast";
  bufferingRisk: "unknown" | "low" | "high";
  confidence: PlaybackHintConfidence;
}

export interface SourcePlaybackHints {
  audio: PlaybackLanguageObservation;
  burnedInSubtitles: PlaybackLanguageObservation;
  video: PlaybackVideoObservation;
  performance: PlaybackPerformanceObservation;
  notes: readonly PlaybackObservationNote[];
}

export interface AudioTrack {
  id?: string | number;
  language?: string;
  lang?: string;
  label?: string;
  name?: string;
  channels?: string | number;
  codec?: string;
  default?: boolean;
}

export interface SubtitleTrack {
  id?: string;
  display?: string;
  label?: string;
  file?: string;
  url?: string;
  lang?: string;
  language?: string;
  origin?: "source" | "opensubtitles" | "subdl";
  encoding?: string;
  hearingImpaired?: boolean;
}

export interface ResolverResponse {
  server: string;
  serverLabel: string;
  latencyMs: number;
  candidates: StreamCandidate[];
  subtitles: SubtitleTrack[];
  alternates?: Array<{
    classification: "proxy" | "external" | "invalid";
    reason: string;
  }>;
}
