import type { ProviderMedia, ProviderResolveOptions } from "./registry.d.mts";

export declare const VIDFAST_FAILURE_DOMAIN: string;

export declare class VidfastError extends Error {
  status: number | null;
  retryable: boolean;
  retryAfterMs: null;
  details: Record<string, unknown> | null;
}

export declare function extractVidfastBootstrap(html: string): string | null;

export declare function resolveVidfast(
  media: ProviderMedia,
  options?: ProviderResolveOptions & {
    fetchImpl?: typeof fetch;
    origin?: string;
    codecOrigin?: string;
    codecOrigins?: readonly string[];
    codecStrategies?: ReadonlyArray<{
      id: string;
      bootstrap(
        fetchImpl: typeof fetch,
        encryptedBootstrap: string,
        signal?: AbortSignal,
      ): Promise<unknown>;
      decode(
        fetchImpl: typeof fetch,
        cipher: string,
        signal: AbortSignal | undefined,
        stage: string,
      ): Promise<unknown>;
    }>;
    mediaHosts?: ReadonlySet<string>;
    extraMediaHosts?: readonly string[];
  },
): Promise<{
  variants: Array<Record<string, unknown>>;
  subtitles: Array<Record<string, unknown>>;
  latencyMs: number;
}>;

export declare function createVidfastResolver(
  id: string,
): (
  media: ProviderMedia,
  options?: ProviderResolveOptions,
) => Promise<{
  candidates: Array<Record<string, unknown>>;
  subtitles: Array<Record<string, unknown>>;
  latencyMs: number;
}>;
