import type {
  ProviderMedia,
  ProviderResolveOptions,
  ProviderResolveResult,
} from "./registry.d.mts";

export declare class VideasyError extends Error {
  status: number | null;
  retryable: boolean;
  retryAfterMs: number | null;
  details: { stage?: string } | null;
}

export declare function decodeVideasyPayload(
  cipher: string,
  seed: string,
  mediaId: number,
): string;

export declare function resolveVideasy(
  media: ProviderMedia,
  options?: ProviderResolveOptions & {
    apiOrigin?: string;
    playerOrigin?: string;
    fetchImpl?: typeof fetch;
    decodeImpl?: (
      cipher: string,
      seed: string,
      mediaId: number,
    ) => string;
  },
): Promise<{
  variants: Array<Record<string, unknown>>;
  subtitles: ProviderResolveResult["subtitles"];
  latencyMs: number;
}>;

export declare function createVideasyResolver(
  id: string,
): (
  media: ProviderMedia,
  options?: ProviderResolveOptions,
) => Promise<ProviderResolveResult>;
