import type {
  ProviderMedia,
  ProviderResolveOptions,
  ProviderResolveResult,
} from "./registry.d.mts";

export interface StremioResolverConfig {
  manifestUrl: string;
  fetchImpl?: typeof fetch;
}

export declare class StremioError extends Error {}

export declare function createStremioResolver(
  sourceId: string,
  config: StremioResolverConfig,
): (
  media: ProviderMedia,
  options?: ProviderResolveOptions,
) => Promise<ProviderResolveResult>;
