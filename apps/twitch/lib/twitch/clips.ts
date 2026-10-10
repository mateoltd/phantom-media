import { runQuery } from "./gql.ts";
import { UpstreamError } from "../errors.ts";
import { ResourceCache } from "../cache.ts";
import { mediaDestination } from "../media/destination.ts";
export interface ClipMetadata {
  id: string; slug: string; title: string; createdAt: string; durationSeconds?: number; thumbnailURL?: string;
  sources: { quality: string; url: string }[];
}
interface ClipResponse { clip: { id: string; slug: string; title: string; createdAt: string; durationSeconds?: number; thumbnailURL?: string; videoQualities: { quality: string; sourceURL: string }[] } | null }
function validSource(url: string): boolean { try { return mediaDestination(url).pathname.endsWith(".mp4"); } catch { return false; } }
const metadata = new ResourceCache<ClipMetadata>(64);
export function fetchClip(slug: string, signal?: AbortSignal): Promise<ClipMetadata> {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(slug)) return Promise.reject(new UpstreamError("not-found"));
  return metadata.load(slug, async () => {
    const data = await runQuery<ClipResponse>(`query ClipMetadata($slug: ID!) { clip(slug: $slug) { id slug title createdAt durationSeconds thumbnailURL videoQualities { quality sourceURL } } }`, { slug });
    const clip = data.clip;
    if (!clip) throw new UpstreamError("not-found");
    if (typeof clip.id !== "string" || clip.slug !== slug || !Array.isArray(clip.videoQualities)) throw new UpstreamError("schema");
    const sources = clip.videoQualities.flatMap(source => /^\d{3,4}$/.test(source.quality) && validSource(source.sourceURL) ? [{ quality: source.quality, url: source.sourceURL }] : []);
    return { id: clip.id, slug, title: clip.title, createdAt: clip.createdAt, durationSeconds: clip.durationSeconds, thumbnailURL: clip.thumbnailURL, sources };
  }, 300_000, signal);
}
export async function signClip(slug: string, signal?: AbortSignal): Promise<{ signature: string; token: string; expires?: number }> {
  const data = await runQuery<{ clip: { playbackAccessToken: { signature: string; value: string } } | null }>(`query ClipSigning($slug: ID!) { clip(slug: $slug) { playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { signature value } } }`, { slug }, { signal });
  const token = data.clip?.playbackAccessToken;
  if (!token || typeof token.signature !== "string" || typeof token.value !== "string") throw new UpstreamError("unavailable");
  let expires: number | undefined;
  try { const raw = JSON.parse(token.value); if (typeof raw.expires === "number" && Number.isFinite(raw.expires)) expires = raw.expires; } catch {}
  return { signature: token.signature, token: token.value, expires };
}
