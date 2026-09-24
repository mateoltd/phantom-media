import { TwitchVideoData } from "./twitch";

export interface VodUrlInfo {
  domain: string;
  vodSpecialID: string;
  channel: string;
  broadcastType: string;
}

export function extractUrlInfo(vodData: TwitchVideoData): VodUrlInfo {
  const url = new URL(vodData.seekPreviewsURL);
  const domain = url.host;
  const paths = url.pathname.split("/");
  const storyboardIndex = paths.findIndex((p) => p.includes("storyboards"));
  const vodSpecialID = paths[storyboardIndex - 1];

  return {
    domain,
    vodSpecialID,
    channel: vodData.owner.login,
    broadcastType: vodData.broadcastType.toLowerCase(),
  };
}

export function buildPlaylistUrl(
  info: VodUrlInfo,
  vodId: string,
  qualityKey: string,
  createdAt: string
): string {
  const { domain, vodSpecialID, channel, broadcastType } = info;

  if (broadcastType === "highlight") {
    return `https://${domain}/${vodSpecialID}/${qualityKey}/highlight-${vodId}.m3u8`;
  }

  if (broadcastType === "upload") {
    const created = new Date(createdAt);
    const daysDiff = (Date.now() - created.getTime()) / (1000 * 3600 * 24);
    if (daysDiff > 7) {
      return `https://${domain}/${channel}/${vodId}/${vodSpecialID}/${qualityKey}/index-dvr.m3u8`;
    }
  }

  return `https://${domain}/${vodSpecialID}/${qualityKey}/index-dvr.m3u8`;
}
