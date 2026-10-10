import type { MediaVariant } from "../contracts.ts";

const VIDEO_CODEC = /^(?:avc[13]|hev1|hvc1|av01|vp0[89]|dvh[1e])(?:\.|$)/i;
const AUDIO_CODEC = /^(?:mp4a|ac-3|ec-3|opus|flac)(?:\.|$)/i;

/** Preserve observed codec spelling while removing duplicate sample types. */
export function codecTokens(value?: string): string[] {
  const seen = new Set<string>();
  return (value ?? "").split(",").map(token => token.trim()).filter(token => {
    if (!/^[a-z0-9.-]+$/i.test(token) || seen.has(token.toLowerCase())) return false;
    seen.add(token.toLowerCase());
    return true;
  });
}

export function hasVideoCodec(value?: string): boolean {
  return codecTokens(value).some(token => VIDEO_CODEC.test(token));
}

export function audioCodec(value?: string): string | undefined {
  return codecTokens(value).filter(token => AUDIO_CODEC.test(token)).join(",") || undefined;
}

/** Positive audio evidence wins over a mislabeled kind or fabricated dimensions. */
export function isAudioVariant(variant: MediaVariant): boolean {
  return Boolean(variant.isAudioOnly) || variant.kind === "audio" || variant.key === "audio_only" ||
    Boolean(audioCodec(variant.codec) && !hasVideoCodec(variant.codec));
}

export function videoVariants(variants: readonly MediaVariant[]): MediaVariant[] {
  return variants.filter(variant => variant.kind === "video" && !isAudioVariant(variant));
}

export function hasVideoAttributes(variant: MediaVariant): boolean {
  if (isAudioVariant(variant) || !hasVideoCodec(variant.codec)) return false;
  const size = variant.resolution?.match(/^([1-9]\d*)x([1-9]\d*)$/);
  return Boolean(size && Number.isSafeInteger(Number(size[1])) && Number.isSafeInteger(Number(size[2])));
}

/** Source dimensions are observed from the master or decoder, never assumed. */
export function videoQualityLabel(variant: MediaVariant, decodedResolution?: string): string {
  if (isAudioVariant(variant) || variant.key !== "chunked" && variant.name !== "Source") return variant.name;
  const size = (variant.resolution ?? decodedResolution)?.match(/^([1-9]\d*)x([1-9]\d*)$/);
  if (!size) return "Source";
  const frameRate = variant.kind === "video" && variant.frameRate && variant.frameRate >= 50 ? Math.round(variant.frameRate) : "";
  return `${size[2]}p${frameRate} (Source)`;
}
