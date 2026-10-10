import "../server-boundary.ts";
import type { ClipPlaybackData } from "./data.ts";
import type { MediaVariant } from "../contracts.ts";
import { fetchClip, signClip } from "../twitch/clips.ts";
import { ResourceCache } from "../cache.ts";
const signing = new ResourceCache<ClipPlaybackData>(32);
export function resolveClip(slug: string, refresh = false, signal?: AbortSignal): Promise<ClipPlaybackData> {
  const load = async () => {
    const [clip, access] = await Promise.all([fetchClip(slug), signClip(slug)]);
    const now = Date.now();
    const cacheUntil = Math.max(now, Math.min(now + 30_000, (access.expires ?? (now / 1000 + 30)) * 1000 - 5000));
    const qualities: MediaVariant[] = clip.sources.map(source => {
      const url = new URL(source.url); url.searchParams.set("sig", access.signature); url.searchParams.set("token", access.token);
      return { key: source.quality, name: `${source.quality}p`, kind: "video", isAudioOnly: false, delivery: "file", identity: source.url, playlistUrl: `/api/proxy?url=${encodeURIComponent(url.href)}`, metadata: "unknown" };
    });
    return { slug, id: clip.id, title: clip.title, createdAt: clip.createdAt, duration: clip.durationSeconds, thumbnail: clip.thumbnailURL, qualities, expiresAt: access.expires ? access.expires * 1000 : undefined, cacheUntil };
  };
  // Explicit refresh is used only after an expired signed file response, never as an integrity workaround.
  return refresh ? load() : signing.load(slug, load, value => Math.max(0, value.cacheUntil - Date.now()), signal);
}
