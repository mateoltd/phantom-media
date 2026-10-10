import type { PlaybackDiagnostics } from "../contracts.ts";

/** Keep only explanatory, source-specific fields; never return the token itself. */
export function tokenDiagnostics(value: string): PlaybackDiagnostics {
  const result: PlaybackDiagnostics = { source: "usher", qualityCapReasons: [] };
  try {
    const token = JSON.parse(value);
    const reasons = token.maximum_video_bitrate_kbps_reasons;
    if (Array.isArray(reasons)) result.qualityCapReasons = reasons.filter((v: unknown) =>
      v === "AUTHZ_NOT_LOGGED_IN" || v === "AUTHZ_DISALLOWED_BITRATE");
    if (typeof token.maximum_video_bitrate_kbps === "number" && Number.isFinite(token.maximum_video_bitrate_kbps)) result.maximumBitrateKbps = token.maximum_video_bitrate_kbps;
    if (Array.isArray(token.chansub?.restricted_bitrates)) result.subscriberOnly = token.chansub.restricted_bitrates.length > 0;
    if (typeof token.geoblock_reason === "string" && /^[A-Z_]{1,80}$/.test(token.geoblock_reason)) result.geoReason = token.geoblock_reason;
  } catch { /* Diagnostics are optional. */ }
  return result;
}
