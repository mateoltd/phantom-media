import type { OutputSink, ProgressListener } from "./types.ts";
import { browserMediaUrl } from "./urls.ts";
const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
export interface SegmentRequest { url: string; range?: { start: number; end: number } }
export interface DownloadPlaylist { requests: SegmentRequest[]; extension: "ts" | "mp4"; complete: boolean }
function mediaUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!/^https?:$/.test(url.protocol) || url.origin !== new URL(base).origin) throw new Error("Unsupported media destination");
  return url.href;
}
export function parseDownloadPlaylist(text: string, base: string): DownloadPlaylist {
  if (!text.startsWith("#EXTM3U") || text.includes("#EXT-X-STREAM-INF")) throw new Error("A media playlist is required");
  if (/^#EXT-X-KEY:(?!.*METHOD=NONE)/m.test(text)) throw new Error("Encrypted downloads are unsupported");
  const requests: SegmentRequest[] = []; let init: string | undefined, pendingRange: string | undefined;
  let previousUrl = "", previousEnd = -1, expectSegment = false;
  function request(uri: string, rawRange?: string): SegmentRequest {
    const url = mediaUrl(uri, base); let range: SegmentRequest["range"];
    if (rawRange) {
      const match = /^(\d+)(?:@(\d+))?$/.exec(rawRange);
      if (!match) throw new Error("Invalid byte range");
      const start = match[2] ? Number(match[2]) : previousUrl === url ? previousEnd + 1 : NaN;
      const length = Number(match[1]);
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || length > MAX_SEGMENT_BYTES) throw new Error("Unsupported byte range");
      range = { start, end: start + length - 1 }; previousEnd = range.end;
    } else previousEnd = -1;
    previousUrl = url; return { url, range };
  }
  for (const line of text.split(/\r?\n/).map(value => value.trim())) {
    if (line.startsWith("#EXT-X-MAP:")) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1], bytes = /BYTERANGE="([^"]+)"/.exec(line)?.[1];
      if (!uri || (init && init !== line) || (!init && requests.length)) throw new Error("Changing initialization segments are unsupported");
      if (!init) { requests.push(request(uri, bytes)); init = line; }
    } else if (line.startsWith("#EXT-X-BYTERANGE:")) pendingRange = line.slice(17);
    else if (line.startsWith("#EXTINF:")) { if (expectSegment) throw new Error("Missing media segment"); expectSegment = true; }
    else if (line && !line.startsWith("#")) {
      if (!expectSegment) throw new Error("Unexpected playlist URI");
      requests.push(request(line, pendingRange)); pendingRange = undefined; expectSegment = false;
    }
  }
  if (expectSegment || pendingRange || requests.length === (init ? 1 : 0)) throw new Error("Incomplete media playlist");
  if (requests.length > 25_000) throw new Error("Playlist is too large");
  return { requests, extension: init ? "mp4" : "ts", complete: text.includes("#EXT-X-ENDLIST") };
}
/** Stream one ordered segment at a time; source bitrate does not determine buffered memory. */
export async function downloadHls(playlist: DownloadPlaylist, sink: OutputSink, progress: ProgressListener, signal: AbortSignal): Promise<void> {
  let written = 0, bytes = 0;
  for (const request of playlist.requests) {
    signal.throwIfAborted();
    const headers: Record<string, string> = request.range ? { Range: `bytes=${request.range.start}-${request.range.end}` } : {};
    const response = await fetch(browserMediaUrl(request.url), { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]), headers });
    const length = response.headers.get("Content-Length");
    const expected = request.range ? request.range.end - request.range.start + 1 : length === null ? undefined : Number(length);
    if (!response.ok || !response.body || expected !== undefined && (!Number.isSafeInteger(expected) || expected < 1 || expected > MAX_SEGMENT_BYTES)) {
      await response.body?.cancel();
      throw new Error("Media segment is unavailable or exceeds the transfer limit");
    }
    if (request.range && (response.status !== 206 || response.headers.get("Content-Range")?.split("/")[0] !== `bytes ${request.range.start}-${request.range.end}`)) {
      await response.body.cancel();
      throw new Error("Server did not preserve the requested byte range");
    }
    const reader = response.body.getReader();
    let segmentBytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const result = await reader.read();
        if (result.done) break;
        segmentBytes += result.value.byteLength;
        if (segmentBytes > MAX_SEGMENT_BYTES || expected !== undefined && segmentBytes > expected) throw new Error("Media segment exceeds its declared size");
        // Await disk backpressure before reading another network chunk.
        await sink.write(result.value);
        bytes += result.value.byteLength;
        progress({ phase: "downloading", downloaded: written, total: playlist.requests.length, bytes });
      }
      if (!segmentBytes || expected !== undefined && segmentBytes !== expected) throw new Error("Media segment was truncated");
      written++;
      progress({ phase: "downloading", downloaded: written, total: playlist.requests.length, bytes });
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
