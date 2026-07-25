import type { StreamCandidate, SubtitleTrack } from "../../lib/types";
import type { ProviderDescriptor } from "./catalog.d.mts";

export interface ProviderMedia {
  type: "movie" | "tv";
  tmdbId: number;
  imdbId?: string;
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
}

export interface ProviderResolveOptions {
  signal?: AbortSignal;
  /** Skip whatever the provider has cached for this exact request. */
  fresh?: boolean;
}

export interface ProviderResolveResult {
  candidates: StreamCandidate[];
  subtitles: SubtitleTrack[];
  latencyMs: number;
}

export interface Provider extends ProviderDescriptor {
  resolve(
    media: ProviderMedia,
    options?: ProviderResolveOptions,
  ): Promise<ProviderResolveResult>;
}

export declare function getProvider(id: string): Provider | null;
export declare function listProviders(): Provider[];
