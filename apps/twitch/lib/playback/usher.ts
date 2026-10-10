import type { MediaVariant } from "../contracts.ts";
import { getPlaybackLocation } from "../twitch/playback.ts";
import { fetchMedia, mediaDestination } from "../media/destination.ts";
import { readLimitedText } from "../media/read.ts";
import { UpstreamError } from "../errors.ts";
import { audioCodec, codecTokens, hasVideoCodec } from "../media/variants.ts";

export function parseUsherMaster(text: string, masterUrl: string): MediaVariant[] {
  if (!text.trimStart().startsWith("#EXTM3U")) throw new UpstreamError("schema");
  const lines = text.split(/\r?\n/);
  const variants: MediaVariant[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const next = lines[index + 1]?.trim();
    if (!next || next.startsWith("#")) continue;
    const attr = (key: string) => line.match(new RegExp(`(?:[:,])${key}=(?:"([^"]*)"|([^,]*))`))?.slice(1).find(value => value !== undefined);
    const label = attr("VIDEO") ?? attr("STABLE-VARIANT-ID") ?? attr("IVS-NAME");
    const resolution = attr("RESOLUTION");
    const codec = codecTokens(attr("CODECS")).join(",") || undefined;
    const audioOnly = label === "audio_only" || Boolean(audioCodec(codec) && !hasVideoCodec(codec));
    const bandwidth = Number(attr("BANDWIDTH"));
    const frameRate = Number(attr("FRAME-RATE"));
    const common = { key: `usher-${variants.length}`, delivery: "hls" as const,
      playlistUrl: mediaDestination(new URL(next, masterUrl)).href,
      bandwidth: Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : undefined,
      metadata: "observed" as const };
    variants.push(audioOnly
      ? { ...common, kind: "audio", isAudioOnly: true, name: "Audio Only", codec: audioCodec(codec) }
      : { ...common, kind: "video", isAudioOnly: false,
          name: label === "chunked" ? "Source" : label ?? resolution ?? `Quality ${variants.length + 1}`,
          resolution: resolution && /^\d+x\d+$/.test(resolution) ? resolution : undefined,
          frameRate: Number.isFinite(frameRate) && frameRate > 0 ? frameRate : undefined, codec });
  }
  return variants;
}

export async function resolveUsher(id: string, signal?: AbortSignal) {
  const location = await getPlaybackLocation("vod", id, signal);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const response = await fetchMedia(location.url, { signal: deadline });
  if (!response.ok) { await response.body?.cancel(); throw new UpstreamError(response.status === 403 ? "unavailable" : "transport"); }
  return { variants: parseUsherMaster(await readLimitedText(response, 512 * 1024, deadline), response.url || location.url), diagnostics: location.diagnostics };
}
