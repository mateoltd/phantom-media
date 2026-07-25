/**
 * The one road from an upstream payload to a playable candidate.
 *
 * Every provider funnels through here, and identity is stamped from the
 * catalog rather than taken from what the provider handed over. That is the
 * point: the rule that no third party's brand reaches a response body, a
 * screen or a log line stops being a discipline that each new provider has to
 * remember and becomes a property of the only function that can mint a
 * candidate — one that `test/providers.test.mjs` asserts directly.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

import { providerDescriptor } from "./catalog.mjs";

export function sourceType(variant) {
  const declared = String(variant?.type ?? "").toLowerCase();
  const url = String(variant?.url ?? "").toLowerCase();
  if (declared === "hls" || url.includes(".m3u8") || url.includes("hlsproxy")) {
    return "hls";
  }
  if (declared === "dash" || url.includes(".mpd")) return "dash";
  if (declared === "mp4" || url.includes(".mp4")) return "mp4";
  return "unknown";
}

export function numericResolution(value) {
  const match = String(value ?? "").match(/(\d{3,4})/);
  return match ? Number(match[1]) : null;
}

/**
 * `score` is a rough pre-sort within one provider's answer so the best variant
 * is first if nothing else looks at it. The router does not read it: it ranks
 * on measured latency and on whether a manifest actually answered, neither of
 * which an upstream is in a position to claim.
 */
function variantScore(type, resolution) {
  const typeScore = type === "hls" ? 300 : type === "mp4" ? 200 : 100;
  return typeScore + (resolution ?? 0) / 10;
}

/**
 * @param {Array<{url: string, type?: string, quality?: string|number}>} variants
 * @param {string} sourceId
 */
export function normalizeVariants(variants, sourceId) {
  const descriptor = providerDescriptor(sourceId);
  const label = descriptor?.label ?? sourceId;
  const candidates = [];
  const seen = new Set();

  for (const variant of variants ?? []) {
    if (typeof variant?.url !== "string") continue;

    let parsed;
    try {
      parsed = new URL(variant.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);

    const type = sourceType(variant);
    const resolution =
      variant.resolution === undefined
        ? numericResolution(variant.quality)
        : variant.resolution;

    candidates.push({
      id: `src:${sourceId}:${candidates.length}`,
      // Identity comes from the catalog. Whatever the provider called itself
      // is discarded here and never reaches anything downstream.
      server: sourceId,
      serverLabel: label,
      provider: sourceId,
      providerLabel: label,
      url: parsed.href,
      type,
      // `declaredType` is upstream's own word for the container, so it is
      // narrowed to the shapes we understand rather than passed through.
      declaredType: type === "unknown" ? null : type,
      resolution: resolution ?? null,
      format: null,
      size: null,
      score: variantScore(type, resolution),
    });
  }

  return candidates.sort((left, right) => right.score - left.score);
}
