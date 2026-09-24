import { fetchChannel, fetchVodMetadata, fetchVodPlaybackUrl } from "./twitch";
import type { TwitchVideoData } from "./twitch";
import { extractUrlInfo, buildPlaylistUrl, VodUrlInfo } from "./url-builder";
import { probeQuality } from "./quality";
import { defaultResolutions } from "./resolutions";
import { cacheGet, cacheSet } from "./cache";
import { ResolvedQuality } from "./validation";

export interface CachedVodData {
  vodId: string;
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  title?: string;
  previewThumbnailURL?: string;
  isLiveArchive?: boolean;
  broadcastType: string;
  createdAt: string;
  urlInfo: VodUrlInfo;
  qualities: ResolvedQuality[];
}

export async function resolveVod(vodId: string): Promise<CachedVodData> {
  const cacheKey = `vod:v4:${vodId}`;
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

  // Probe all qualities in parallel
  const probeEntries = Object.entries(defaultResolutions);

  const probes = probeEntries.map(async ([key, res]) => {
    const playlistUrl = buildPlaylistUrl(urlInfo, vodId, key, vodData.createdAt);
    const result = await probeQuality(playlistUrl);
    return { key, res, result, playlistUrl };
  });

  const results = await Promise.all(probes);

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
