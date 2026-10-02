import type { ProviderMedia, ProviderResolveOptions, ProviderResolveResult } from "./registry.mjs";

export declare const CINESRC_FAILURE_DOMAIN: string;
export declare const CINESRC_MAX_RACE_LANES: number;
export declare const CINESRC_LANE_TIMEOUT_MS: number;

export declare class CineSrcError extends Error {
  status: number | null;
  retryable: boolean;
  retryAfterMs: number | null;
  details: Record<string, unknown> | null;
}

export interface CineSrcResolveOptions extends ProviderResolveOptions {
  origin?: string;
  fetchImpl?: typeof fetch;
}

export declare function assertCineSrcMediaUrl(input: string | URL): URL;
export declare function extractCineSrcContract(
  sources: string[],
): {
  providerListAction: string;
  streamAction: string;
  runtimePaths: readonly string[];
} | null;
export declare function normalizeCineSrcProviders(
  value: unknown,
): Array<{ id: string; rank: number }>;
export declare function parseCineSrcRscValue(payload: string, index?: number): unknown;
export declare function cinesrcLaneId(providerId: string, variantUrl: string, index: number): string;
export declare function estimateManifestQuality(manifest: string): { bandwidth: number; height: number };
export declare function raceCineSrcLanes(
  context: unknown,
  providers: Array<{ id: string; rank: number }>,
  options?: { maxLanes?: number; laneTimeoutMs?: number },
): Promise<{ lanes: unknown[]; attempts: unknown[] }>;
export declare function resolveCineSrc(
  media: ProviderMedia,
  options?: CineSrcResolveOptions,
): Promise<{ variants: unknown[]; subtitles: unknown[]; latencyMs: number; laneId?: string; lanes?: unknown[]; alternates?: unknown[] }>;
export declare function createCineSrcResolver(
  id: string,
): (media: ProviderMedia, options?: CineSrcResolveOptions) => Promise<ProviderResolveResult>;
