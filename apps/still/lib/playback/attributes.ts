import type { MediaVariant } from "../contracts.ts";
import { ResourceCache } from "../cache.ts";
import { resolveUsher } from "./usher.ts";

const attributes = new ResourceCache<MediaVariant[] | null>(64);

/** Optional metadata only: failures never replace or invalidate keyless media. */
export async function observeCdnAttributes(id: string, variants: MediaVariant[]): Promise<MediaVariant[]> {
  const observed = await attributes.load(id,
    () => resolveUsher(id, AbortSignal.timeout(2500)).then(result => result.variants).catch(() => null),
    value => value ? 300_000 : 30_000).catch(() => null);
  if (!observed) return variants;
  return mergeCdnAttributes(variants, observed);
}

export function mergeCdnAttributes(variants: MediaVariant[], observed: MediaVariant[]): MediaVariant[] {
  const location = (value: string) => { const url = new URL(value); return url.origin + url.pathname; };
  return variants.map(variant => {
    const match = observed.find(candidate => location(candidate.playlistUrl) === location(variant.playlistUrl));
    if (!match || variant.kind === "audio" && match.kind !== "audio") return variant;
    // Match the actual rendition, never infer attributes from order or a sibling.
    return { ...match, key: variant.key, playlistUrl: variant.playlistUrl };
  });
}
