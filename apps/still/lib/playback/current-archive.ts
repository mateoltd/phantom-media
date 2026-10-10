import "../server-boundary.ts";
import { fetchCatalogSlice } from "../twitch/catalogs.ts";
import { fetchChannelBasics } from "../twitch/channels.ts";
import { ResourceCache } from "../cache.ts";
import { fetchMedia } from "../media/destination.ts";
import { archiveFolder, archiveHosts, archiveStartCandidates } from "./archive.ts";
import { resolveCdn } from "./cdn.ts";
import type { ResourceRef, ChannelData } from "../contracts.ts";
import { playbackTtl } from "./freshness.ts";
import type { ArchivePlaybackData } from "./data.ts";

const archives = new ResourceCache<ArchivePlaybackData | null>(32);

/** Known live-stream identity and the original recording-name compatibility formula. */
export async function resolveCurrentArchive(login: string, signal?: AbortSignal): Promise<ArchivePlaybackData | null> {
  const channel = await fetchChannelBasics(login);
  if (!channel.stream) return null;
  return resolveFixedArchive({ kind: "archive", channel: login, streamId: channel.stream.id, startedAt: new Date(channel.stream.createdAt).toISOString() }, signal, channel);
}
export async function resolveFixedArchive(resource: Extract<ResourceRef, { kind: "archive" }>, signal?: AbortSignal, knownChannel?: ChannelData): Promise<ArchivePlaybackData | null> {
  const { channel: login, streamId, startedAt } = resource;
  return archives.load(JSON.stringify(resource), async () => {
    const channel = knownChannel ?? await fetchChannelBasics(login);
    const current = channel.stream?.id === streamId;
    const catalog = await fetchCatalogSlice({ source: "channel-videos", anchor: login, first: 8, sort: "TIME", type: "ARCHIVE" }).catch(() => null);
    const hosts = archiveHosts(catalog?.items.map(item => ({ previewThumbnailURL: item.thumbnail })) ?? []);
    for (const domain of hosts) {
      const starts = archiveStartCandidates(startedAt);
      for (let index = 0; index < starts.length; index += 4) {
        const candidates = starts.slice(index, index + 4).map(start => archiveFolder(login, streamId, start));
        const hits = await Promise.all(candidates.map(async folder => {
          const response = await fetchMedia(`https://${domain}/${folder}/chunked/index-dvr.m3u8`, { method: "HEAD", signal: AbortSignal.timeout(8_000) }).catch(() => null);
          await response?.body?.cancel();
          return response?.ok ? folder : null;
        }));
        const folder = hits.find(Boolean);
        if (!folder) continue;
        const { variants, manifest } = await resolveCdn({ domain, folder, channel: login, broadcastType: "archive" }, null, startedAt);
        if (!variants.length) continue;
        return {
          resource, channel: login,
          channelDisplayName: channel.displayName, channelProfileImageURL: channel.profileImageURL,
          channelIsPartner: channel.roles?.isPartner === true, channelProfile: channel,
          title: current ? channel.stream?.title : "Broadcast archive", duration: manifest?.duration ?? 0, lifecycle: manifest?.complete ? "complete" : current ? "growing" : "unknown", isLiveArchive: !manifest?.complete,
          broadcastType: "archive", qualities: variants, segments: [], chapters: [], playback: { state: "ready", source: "cdn" },
        } satisfies ArchivePlaybackData;
      }
    }
    return null;
  }, value => value ? playbackTtl(value.lifecycle) : 5_000, signal);
}
