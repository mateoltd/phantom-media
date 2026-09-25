import { createHash } from "node:crypto";

/** CDN hosts that hold this channel's past broadcasts, read from their thumbnail URLs. */
export function archiveHosts(videos: { previewThumbnailURL?: string }[]): string[] {
  const hosts = videos
    .map((video) => video.previewThumbnailURL?.match(/\/cf_vods\/([a-z0-9]+)\//)?.[1])
    .filter((host): host is string => Boolean(host))
    .map((host) => `${host}.cloudfront.net`);
  return [...new Set(hosts)];
}

// Twitch names the recording folder after the stream, but hashes it so the path cannot be listed.
export function archiveFolder(login: string, streamId: string, startedAt: number): string {
  const name = `${login}_${streamId}_${startedAt}`;
  return `${createHash("sha1").update(name).digest("hex").slice(0, 20)}_${name}`;
}

/** The folder timestamp is the stream start in seconds, which can drift a few seconds from the reported createdAt. */
export function archiveStartCandidates(createdAt: string, spread = 30): number[] {
  const base = Math.floor(Date.parse(createdAt) / 1000);
  if (!Number.isFinite(base)) return [];
  const candidates = [base];
  for (let offset = 1; offset <= spread; offset++) candidates.push(base - offset, base + offset);
  return candidates;
}
