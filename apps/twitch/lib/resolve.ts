import { getVodPlaybackSegments } from "./playback-segments";
import type { VodPlaybackData } from "./playback";
import { fetchChannel, fetchVodMetadata, fetchVodPlaybackUrl } from "./twitch";
import type { TwitchVideoData } from "./twitch";
import { extractUrlInfo, buildPlaylistUrl, VodUrlInfo } from "./url-builder";
import { probeQuality } from "./quality";
import { defaultResolutions } from "./resolutions";
import { cacheGet, cacheSet } from "./cache";
import { ResolvedQuality } from "./validation";
import { archiveFolder, archiveHosts, archiveStartCandidates } from "./stream-archive";

export interface CachedVodData extends VodPlaybackData {
  createdAt: string;
  urlInfo: VodUrlInfo;
}

export async function resolveVod(vodId: string): Promise<CachedVodData> {
  const cacheKey = `vod:v6:${vodId}`;
  const cached = cacheGet<CachedVodData>(cacheKey);
  if (cached) return cached;

  const vodData = await fetchVodMetadata(vodId);
  // Channel decoration is optional for playback. Twitch can fail this second
  // lookup even after it has returned valid VOD metadata and playlists.
  const channelData = await fetchChannel(vodData.owner.login).catch(() => null);
  const urlInfo = extractUrlInfo(vodData);
  const createdAt = new Date(vodData.createdAt).getTime();
  const elapsedMs = Date.now() - createdAt;
  const knownDurationMs =
    typeof vodData.lengthSeconds === "number" ? vodData.lengthSeconds * 1000 : 0;
  const isRecentArchive =
    urlInfo.broadcastType === "archive" &&
    Number.isFinite(createdAt) &&
    Date.now() - createdAt < 72 * 60 * 60 * 1000;
  const isLiveArchive =
    isRecentArchive &&
    (!knownDurationMs || elapsedMs - knownDurationMs < 30 * 60 * 1000);

  if (isRecentArchive) {
    const fallbackQualities = await resolveVodFromUsher(vodId);
    if (fallbackQualities.length > 0) {
      const data = createCachedVodData({
        vodId,
        vodData,
        channelData,
        isLiveArchive,
        urlInfo,
        qualities: fallbackQualities,
      });

      cacheSet(cacheKey, data, 30_000);
      return data;
    }
  }

  const qualities = await probeQualities(urlInfo, vodId, vodData.createdAt);

  if (qualities.length === 0) {
    const fallbackQualities = await resolveVodFromUsher(vodId);
    if (fallbackQualities.length > 0) {
      const data = createCachedVodData({
        vodId,
        vodData,
        channelData,
        isLiveArchive,
        urlInfo,
        qualities: fallbackQualities,
      });

      cacheSet(cacheKey, data);
      return data;
    }
  }

  const data = createCachedVodData({
    vodId,
    vodData,
    channelData,
    isLiveArchive,
    urlInfo,
    qualities,
  });

  cacheSet(cacheKey, data);
  return data;
}

async function probeQualities(urlInfo: VodUrlInfo, vodId: string, createdAt: string): Promise<ResolvedQuality[]> {
  const results = await Promise.all(Object.entries(defaultResolutions).map(async ([key, res]) => {
    const playlistUrl = buildPlaylistUrl(urlInfo, vodId, key, createdAt);
    const result = await probeQuality(playlistUrl);
    return { key, res, result, playlistUrl };
  }));

  // Assign decreasing bandwidth values (preserves quality order)
  let bandwidth = 8534030;
  const qualities: ResolvedQuality[] = [];

  for (const { key, res, result, playlistUrl } of results) {
    if (result) {
      qualities.push({
        key,
        name: res.name,
        resolution: res.resolution,
        frameRate: res.frameRate,
        bandwidth,
        codec: result.codec,
        playlistUrl,
      });
      bandwidth -= 100;
    }
  }

  return qualities;
}

export type PlaybackSource = { vodId: string } | { archive: string };

export function readPlaybackSource(params: URLSearchParams): PlaybackSource | null {
  const vodId = params.get("vodId");
  if (vodId) return /^\d+$/.test(vodId) ? { vodId } : null;
  const archive = params.get("archive")?.toLowerCase();
  return archive && /^[a-z0-9_]{3,25}$/.test(archive) ? { archive } : null;
}

export async function resolvePlayback(source: PlaybackSource): Promise<CachedVodData> {
  if ("vodId" in source) return resolveVod(source.vodId);
  const data = await resolveStreamArchive(source.archive);
  if (!data) throw new Error("Archive not found");
  return data;
}

/**
 * Some channels keep the broadcast that is on air out of their video list, so it has no video ID.
 * The recording is still on the CDN under a folder derived from the stream, which is found by probing.
 */
export async function resolveStreamArchive(login: string): Promise<CachedVodData | null> {
  const channel = await fetchChannel(login);
  const stream = channel.stream;
  if (!stream) return null;

  const cacheKey = `archive:v2:${stream.id}`;
  const cached = cacheGet<CachedVodData | false>(cacheKey);
  if (cached !== null) return cached || null;

  const found = await findArchiveFolder(channel.login, stream.id, stream.createdAt, archiveHosts(channel.videos));
  const qualities = found
    ? await probeQualities({ ...found, channel: channel.login, broadcastType: "archive" }, stream.id, stream.createdAt)
    : [];
  if (!found || qualities.length === 0) {
    // The folder can appear a little after the stream starts, so a miss is only remembered briefly.
    cacheSet(cacheKey, false, 2 * 60 * 1000);
    return null;
  }

  const data: CachedVodData = {
    vodId: stream.id,
    channel: channel.login,
    channelDisplayName: channel.displayName,
    channelProfileImageURL: channel.profileImageURL,
    title: stream.title,
    isLiveArchive: true,
    broadcastType: "archive",
    createdAt: stream.createdAt,
    urlInfo: { ...found, channel: channel.login, broadcastType: "archive" },
    qualities,
    segments: [],
  };
  cacheSet(cacheKey, data, 12 * 60 * 60 * 1000);
  return data;
}

async function findArchiveFolder(login: string, streamId: string, createdAt: string, hosts: string[]) {
  const candidates = archiveStartCandidates(createdAt);
  for (const domain of hosts) {
    for (let index = 0; index < candidates.length; index += 16) {
      const batch = candidates.slice(index, index + 16).map((startedAt) => archiveFolder(login, streamId, startedAt));
      const hits = await Promise.all(batch.map(async (folder) => {
        const response = await fetch(`https://${domain}/${folder}/chunked/index-dvr.m3u8`, { method: "HEAD", cache: "no-store" }).catch(() => null);
        return response?.ok ? folder : null;
      }));
      const vodSpecialID = hits.find(Boolean);
      if (vodSpecialID) return { domain, vodSpecialID };
    }
  }
  return null;
}

function createCachedVodData({
  vodId,
  vodData,
  channelData,
  isLiveArchive,
  urlInfo,
  qualities,
}: {
  vodId: string;
  vodData: TwitchVideoData;
  channelData: Awaited<ReturnType<typeof fetchChannel>> | null;
  isLiveArchive: boolean;
  urlInfo: VodUrlInfo;
  qualities: ResolvedQuality[];
}): CachedVodData {
  return {
    vodId,
    channel: channelData?.login ?? vodData.owner.login,
    channelDisplayName: channelData?.displayName,
    channelProfileImageURL: channelData?.profileImageURL,
    title: vodData.title,
    previewThumbnailURL: vodData.previewThumbnailURL,
    isLiveArchive,
    broadcastType: urlInfo.broadcastType,
    createdAt: vodData.createdAt,
    urlInfo,
    qualities,
    segments: getVodPlaybackSegments(vodData),
  };
}

async function resolveVodFromUsher(vodId: string): Promise<ResolvedQuality[]> {
  const masterUrl = await fetchVodPlaybackUrl(vodId);
  const upstream = await fetch(masterUrl, { cache: "no-store" });
  if (!upstream.ok) return [];

  return parseUsherMaster(await upstream.text(), masterUrl);
}

function parseUsherMaster(text: string, masterUrl: string): ResolvedQuality[] {
  const lines = text.split("\n");
  const qualities: ResolvedQuality[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const playlistLine = lines[index + 1]?.trim();
    if (!playlistLine || playlistLine.startsWith("#")) continue;

    const resolution = readAttribute(line, "RESOLUTION") ?? "1920x1080";
    const frameRate = Number(readAttribute(line, "FRAME-RATE") ?? "30") || 30;
    const bandwidth = Number(readAttribute(line, "BANDWIDTH") ?? "0") || 0;
    const codecs = readAttribute(line, "CODECS") ?? "avc1.4D401F,mp4a.40.2";
    const videoCodec = codecs.split(",").find((codec) => !codec.startsWith("mp4a")) ?? codecs;
    const [width, height] = resolution.split("x").map(Number);
    const name =
      readAttribute(line, "VIDEO") ??
      (height ? `${height}p${frameRate >= 50 ? Math.round(frameRate) : ""}` : `Quality ${qualities.length + 1}`);

    qualities.push({
      key: `usher-${qualities.length}`,
      name: name === "chunked" ? "Source" : name,
      resolution: width && height ? `${width}x${height}` : resolution,
      frameRate,
      bandwidth,
      codec: videoCodec,
      playlistUrl: new URL(playlistLine, masterUrl).toString(),
    });
  }

  return qualities;
}

function readAttribute(line: string, name: string): string | null {
  const match = line.match(new RegExp(`${name}=("[^"]+"|[^,]+)`));
  if (!match) return null;
  return match[1].replace(/^"|"$/g, "");
}
