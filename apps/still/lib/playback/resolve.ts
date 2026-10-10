import "../server-boundary.ts";
import type { VodPlaybackData, ArchivePlaybackData } from "./data.ts";
import { fetchVodMetadata } from "../twitch/videos.ts";
import { fetchChannelBasics } from "../twitch/channels.ts";
import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { cdnLocation, resolveCdn } from "./cdn.ts";
import { resolveUsher } from "./usher.ts";
import { getVodPlaybackSegments } from "./segments.ts";
import { playbackTtl } from "./freshness.ts";
import { resolveFixedArchive } from "./current-archive.ts";
import { readManifest } from "../media/manifest.ts";
import { observeCdnAttributes } from "./attributes.ts";

const videos = new ResourceCache<VodPlaybackData>(64);

export function resolveVod(id: string, signal?: AbortSignal): Promise<VodPlaybackData> {
  if (!/^\d{1,20}$/.test(id)) return Promise.reject(new UpstreamError("not-found"));
  return videos.load(id, async () => {
    const metadata = await fetchVodMetadata(id);
    const decoration = fetchChannelBasics(metadata.owner.login).catch(() => null);
    const location = cdnLocation(metadata);
    let variants: VodPlaybackData["qualities"] = [];
    let manifest;
    let diagnostics;
    let source: "cdn" | "usher" = "cdn";
    let reason: UpstreamError["kind"] = "unavailable";
    if (location) {
      const result = await resolveCdn(location, id, metadata.createdAt);
      variants = result.variants.length ? await observeCdnAttributes(id, result.variants) : [];
      manifest = result.manifest;
    }
    if (!variants.length) {
      try {
        const result = await resolveUsher(id);
        variants = result.variants;
        diagnostics = result.diagnostics;
        source = "usher";
        if (variants[0]) manifest = await readManifest(variants[0].playlistUrl).catch(() => undefined);
      } catch (error) { reason = error instanceof UpstreamError ? error.kind : "transport"; }
    }
    const channel = await decoration;
    const correlated = channel?.stream?.archiveVideo?.id === id;
    const lifecycle = manifest?.complete ? "complete" : correlated && metadata.broadcastType === "ARCHIVE" ? "growing" : "unknown";
    return {
      resource: { kind: "vod", id }, vodId: id, channel: metadata.owner.login,
      channelDisplayName: channel?.displayName, channelProfileImageURL: channel?.profileImageURL,
      channelIsPartner: channel?.roles?.isPartner === true, channelProfile: channel ?? undefined,
      title: metadata.title, previewThumbnailURL: metadata.previewThumbnailURL,
      seekPreviewsURL: metadata.seekPreviewsURL, language: metadata.language,
      duration: Math.max(metadata.lengthSeconds ?? 0, manifest?.duration ?? 0),
      broadcastType: metadata.broadcastType.toLowerCase(), lifecycle, isLiveArchive: lifecycle === "growing",
      qualities: variants, segments: getVodPlaybackSegments(metadata), chapters: [], diagnostics,
      playback: variants.length ? { state: "ready", source } : { state: "unavailable", reason },
    };
  }, value => playbackTtl(value.lifecycle), signal);
}

export type PlaybackSource = { vodId: string } | { archive: string; streamId: string; startedAt: string };
export function readPlaybackSource(params: URLSearchParams): PlaybackSource | null {
  const id = params.get("vodId"), channel = params.get("archive")?.toLowerCase();
  if (id) return !channel && /^\d{1,20}$/.test(id) ? { vodId: id } : null;
  const streamId = params.get("streamId"), startedAt = params.get("startedAt"), time = Date.parse(startedAt ?? "");
  return channel && /^[a-z0-9_]{3,25}$/.test(channel) && streamId && /^\d{1,20}$/.test(streamId) && Number.isFinite(time)
    ? { archive: channel, streamId, startedAt: new Date(time).toISOString() } : null;
}
export async function resolvePlayback(source: PlaybackSource, signal?: AbortSignal): Promise<VodPlaybackData | ArchivePlaybackData> {
  const result = "vodId" in source ? await resolveVod(source.vodId, signal) : await resolveFixedArchive({ kind: "archive", channel: source.archive, streamId: source.streamId, startedAt: source.startedAt }, signal);
  if (!result) throw new UpstreamError("not-found");
  return result;
}
