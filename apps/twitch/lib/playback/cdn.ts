import type { MediaVariant } from "../contracts.ts";
import type { TwitchVideoData } from "../twitch/videos.ts";
import { mediaDestination } from "../media/destination.ts";
import { readManifest, type MediaManifest } from "../media/manifest.ts";

export interface CdnLocation { domain: string; folder: string; channel: string; broadcastType: string }
const VARIANTS = ["chunked", "1440p60", "1080p60", "720p60", "480p30", "360p30", "160p30", "audio_only"];

/** Locator validation is independent of parsing/rendering the storyboard document. */
export function cdnLocation(video: TwitchVideoData): CdnLocation | null {
  for (const value of [video.seekPreviewsURL, video.previewThumbnailURL]) {
    if (!value) continue;
    try {
      const url = mediaDestination(value);
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex(part => part === "storyboards" || part === "thumb");
      const folder = parts[marker - 1];
      if (marker < 1 || !folder || !/^[a-z0-9_-]+$/i.test(folder)) continue;
      const cf = parts.indexOf("cf_vods");
      const domain = cf >= 0 && /^[a-z0-9]+$/.test(parts[cf + 1] ?? "")
        ? `${parts[cf + 1]}.cloudfront.net` : url.hostname;
      mediaDestination(`https://${domain}/${folder}/chunked/index-dvr.m3u8`);
      return { domain, folder, channel: video.owner.login, broadcastType: video.broadcastType.toLowerCase() };
    } catch { /* An absent/malformed locator must not prevent other strategies. */ }
  }
  return null;
}

export function cdnPlaylistUrl(location: CdnLocation, id: string | null, key: string, createdAt: string): string | null {
  if (!VARIANTS.includes(key) || !/^[a-z0-9_-]+$/i.test(location.folder)) return null;
  const base = `https://${location.domain}/${location.folder}/${key}`;
  if (location.broadcastType === "archive") return `${base}/index-dvr.m3u8`;
  if (!id || !/^\d+$/.test(id)) return null;
  if (location.broadcastType === "highlight") return `${base}/highlight-${id}.m3u8`;
  if (location.broadcastType === "upload") {
    const age = Date.now() - Date.parse(createdAt);
    if (!Number.isFinite(age) || !/^[a-z0-9_]{3,25}$/i.test(location.channel)) return null;
    return age > 7 * 86400_000
      ? `https://${location.domain}/${location.channel}/${id}/${location.folder}/${key}/index-dvr.m3u8`
      : `${base}/index-dvr.m3u8`;
  }
  return null; // PAST_PREMIERE has no locator-path evidence.
}

export async function resolveCdn(location: CdnLocation, id: string | null, createdAt: string): Promise<{ variants: MediaVariant[]; manifest?: MediaManifest }> {
  const results = await Promise.all(VARIANTS.map(async key => {
    const url = cdnPlaylistUrl(location, id, key, createdAt);
    if (!url) return null;
    try {
      const manifest = await readManifest(url);
      const track = key === "audio_only" ? { kind: "audio", isAudioOnly: true } as const : { kind: "video", isAudioOnly: false } as const;
      return { manifest, variant: { key, name: key === "chunked" ? "Source" : key === "audio_only" ? "Audio Only" : key.replace(/p30$/, "p"),
        ...track, delivery: "hls", playlistUrl: url, metadata: "unknown" } satisfies MediaVariant };
    } catch { return null; }
  }));
  const found = results.filter(value => value !== null);
  return { variants: found.map(value => value.variant), manifest: found.find(value => value.variant.kind === "video")?.manifest ?? found[0]?.manifest };
}
