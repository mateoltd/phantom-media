import "../server-boundary.ts";
import { readLimitedText } from "./read.ts";
import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { fetchMedia } from "./destination.ts";

export interface MediaManifest {
  text: string;
  url?: string;
  complete: boolean;
  duration: number;
  durations: number[];
  sequence: number;
  targetDuration?: number;
  programDateTime?: string;
  rawTdtg?: string;
  etag?: string;
  lastModified?: string;
}

export function parseMediaManifest(text: string): MediaManifest {
  if (!text.trimStart().startsWith("#EXTM3U") || text.includes("#EXT-X-STREAM-INF:")) throw new UpstreamError("schema");
  const durations = [...text.matchAll(/^#EXTINF:([\d.]+)/gm)].map(match => Number(match[1]));
  if (!durations.length || durations.some(value => !Number.isFinite(value) || value <= 0)) throw new UpstreamError("schema");
  const uris = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith("#"));
  if (uris.length !== durations.length) throw new UpstreamError("schema");
  const header = (name: string) => text.match(new RegExp(`^#${name}:(.+)$`, "m"))?.[1].trim();
  const sequence = Number(header("EXT-X-MEDIA-SEQUENCE") ?? 0);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new UpstreamError("schema");
  return {
    text, complete: /^#EXT-X-ENDLIST\s*$/m.test(text), durations,
    duration: durations.reduce((sum, value) => sum + value, 0),
    sequence,
    targetDuration: Number(header("EXT-X-TARGETDURATION")) || undefined,
    programDateTime: header("EXT-X-PROGRAM-DATE-TIME"), rawTdtg: header("ID3-EQUIV-TDTG"),
  };
}

const manifests = new ResourceCache<MediaManifest>(32, 8 * 1024 * 1024, value => value.text.length * 2);

/** Live and LL-HLS playlists can have no complete segments yet; never cache them. */
export async function readLiveManifest(url: string, signal?: AbortSignal): Promise<{ text: string; url: string }> {
  const destination = new URL(url);
  if (!/\.m3u8$/i.test(destination.pathname)) throw new UpstreamError("schema");
  const deadline = AbortSignal.timeout(15_000);
  const stop = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await fetchMedia(destination, { signal: stop });
  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamError(response.status === 404 ? "not-found" : response.status === 403 ? "unavailable" : "transport");
  }
  const text = await readLimitedText(response, 512 * 1024, stop);
  if (!text.trimStart().startsWith("#EXTM3U")) throw new UpstreamError("schema");
  return { text, url: response.url || url };
}

export function readManifest(url: string, signal?: AbortSignal): Promise<MediaManifest> {
  return manifests.load(url, async () => {
    const prior = manifests.peek(url);
    const headers = new Headers();
    if (prior?.etag) headers.set("If-None-Match", prior.etag);
    else if (prior?.lastModified) headers.set("If-Modified-Since", prior.lastModified);
    const response = await fetchMedia(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (response.status === 304 && prior) return {
      ...prior, url: response.url || prior.url || url,
      etag: response.headers.get("etag") ?? prior.etag,
      lastModified: response.headers.get("last-modified") ?? prior.lastModified,
    };
    if (!response.ok) {
      await response.body?.cancel();
      throw new UpstreamError(response.status === 404 ? "not-found" : response.status === 403 ? "unavailable" : "transport");
    }
    const text = await readLimitedText(response, 4 * 1024 * 1024);
    return { ...parseMediaManifest(text), url: response.url || url, etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined };
  }, value => value.complete ? 30_000 : 0, signal);
}
