
import { providerDescriptor } from "./catalog.mjs";
import { sourceAlias } from "../source-ids.mjs";

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

function variantScore(type, resolution) {
  const typeScore =
    type === "hls" || type === "dash" ? 300 : type === "mp4" ? 200 : 100;
  return typeScore + (resolution ?? 0) / 10;
}

export function normalizeVariants(variants, sourceId) {
  const descriptor = providerDescriptor(sourceId);
  const label = descriptor?.label ?? sourceAlias(sourceId);
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
      server: sourceId,
      serverLabel: label,
      provider: sourceId,
      providerLabel: label,
      url: parsed.href,
      type,
      declaredType: type === "unknown" ? null : type,
      resolution: resolution ?? null,
      format: null,
      size: null,
      score: variantScore(type, resolution),
      failureDomain:
        typeof variant.failureDomain === "string"
          ? variant.failureDomain
          : descriptor?.failureDomain ?? null,
      capacityDomains: Array.isArray(variant.capacityDomains)
        ? [...new Set(variant.capacityDomains.filter(
            (domain) => typeof domain === "string" && domain,
          ))]
        : descriptor?.capacityDomains ?? [],
      playbackHints: descriptor?.playbackHints ?? null,
      deliveryMode:
        variant.deliveryMode ??
        (variant.delivery === "full-relay"
          ? "resolver-full-relay"
          : descriptor?.deliveryMode ?? "resolver"),
      embeddedAudioLanguage:
        variant.embeddedAudioLanguage === "en" ? "en" : undefined,
      expiresAt:
        Number.isFinite(Number(variant.expiresAt))
          ? Number(variant.expiresAt)
          : null,
      audioTracks: Array.isArray(variant.audioTracks)
        ? variant.audioTracks.slice(0, 100)
        : [],
      audioLanguages: Array.isArray(variant.audioLanguages)
        ? variant.audioLanguages.slice(0, 100)
        : [],
      language:
        typeof variant.language === "string" ? variant.language : undefined,
      lang: typeof variant.lang === "string" ? variant.lang : undefined,
    });
  }

  return candidates.sort((left, right) => right.score - left.score);
}
