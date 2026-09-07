import type { ProviderMedia, ProviderResolveOptions, ProviderResolveResult } from "./registry.mjs";

export declare const CINESRC_FAILURE_DOMAIN: string;

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
export declare function resolveCineSrc(
  media: ProviderMedia,
  options?: CineSrcResolveOptions,
): Promise<{ variants: unknown[]; subtitles: unknown[]; latencyMs: number }>;
export declare function createCineSrcResolver(
  id: string,
): (media: ProviderMedia, options?: CineSrcResolveOptions) => Promise<ProviderResolveResult>;
