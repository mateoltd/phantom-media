import type { MediaVariant } from "../contracts.ts";
import { codecTokens, hasVideoAttributes, isAudioVariant } from "./variants.ts";

function buildMediaPlaylistPath(source: Record<string, string>, quality: string): string {
  const params = new URLSearchParams({
    ...source,
    quality,
  });
  return `/api/vod/media.m3u8?${params.toString()}`;
}

export function generateMasterPlaylist(
  source: Record<string, string>,
  qualities: MediaVariant[]
): string {
  let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  for (const q of qualities) {
    if (q.delivery !== "hls" || isAudioVariant(q)) continue;
    if (!hasVideoAttributes(q)) {
      console.warn("[still-hls] omitted video rendition without codec/resolution", { key: q.key });
      continue;
    }
    // HLS requires BANDWIDTH. Estimates are transport hints, never measured metadata.
    const estimates: Record<string, number> = { chunked: 8_000_000, "1440p60": 10_000_000, "1080p60": 6_000_000, "720p60": 3_000_000, "480p30": 1_500_000, "360p30": 800_000, "160p30": 300_000 };
    const bandwidth = q.bandwidth && Number.isFinite(q.bandwidth) && q.bandwidth > 0 ? Math.ceil(q.bandwidth) : estimates[q.key] ?? 4_000_000;
    const attrs = [`BANDWIDTH=${bandwidth}`, `NAME="${q.name.replace(/["\r\n]/g, "")}"`,
      `CODECS="${codecTokens(q.codec).join(",")}"`, `RESOLUTION=${q.resolution}`];
    if (q.frameRate && Number.isFinite(q.frameRate) && q.frameRate > 0) attrs.push(`FRAME-RATE=${q.frameRate}`);
    playlist += `#EXT-X-STREAM-INF:${attrs.join(",")}\n${buildMediaPlaylistPath(source, q.key)}\n`;
  }

  return playlist;
}

export function rewriteMediaPlaylist(
  text: string,
  playlistUrl: string,
  proxySegments = false
): string {
  return text
    .split("\n")
    .map((line) => rewritePlaylistLine(line, playlistUrl, proxySegments))
    .join("\n");
}

export function rewriteLiveMasterPlaylist(text: string, playlistUrl: string, prefetch = false): string {
  const lines = text.split("\n");

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      const params = new URLSearchParams({
        url: new URL(trimmed, playlistUrl).toString(),
      });
      if (prefetch) params.set("prefetch", "1");
      return `/api/live/media.m3u8?${params.toString()}`;
    })
    .join("\n");
}

/** Preserve hls.js blocking/delta reload hints across the same-origin route. */
export function liveReloadUrl(playlistUrl: URL, reload: URLSearchParams): URL {
  const upstream = new URL(playlistUrl);
  for (const name of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
    const value = reload.get(name);
    if (value !== null && (name === "_HLS_skip" ? /^(YES|v2)$/.test(value) : /^\d{1,15}$/.test(value))) {
      upstream.searchParams.set(name, value);
    }
  }
  return upstream;
}

export function rewriteLiveMediaPlaylist(text: string, playlistUrl: string, prefetch = false): string {
  const filtered = filterTwitchAdSegments(text);
  // Predictive URLs must not bypass the ad filter. Opt in only for progressive
  // players and a clean live tail; native HLS keeps the ordinary segment list.
  const playable = prefetch && filtered === text ? promoteTwitchPrefetch(filtered) : filtered;
  return playable
    .split("\n")
    .map((line) => rewritePlaylistLine(line, playlistUrl))
    .join("\n");
}

function promoteTwitchPrefetch(text: string): string {
  if (/#EXT-X-ENDLIST|#EXT-X-KEY:.*METHOD=(?!NONE)/.test(text)) return text;
  const lines = text.split("\n");
  const durations = [...text.matchAll(/^#EXTINF:([\d.]+)/gm)].map(match => Number(match[1]));
  const recent = durations.slice(-3).filter(duration => Number.isFinite(duration) && duration > 0);
  if (!recent.length) return text;
  const duration = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  let date: number | null = null;
  let lastDuration = 0;
  let unsafeTail = true;
  let count = 0;
  const existing = new Set(lines.filter(line => line.trim() && !line.startsWith("#")));
  return lines.map(line => {
    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      const parsed = Date.parse(line.slice("#EXT-X-PROGRAM-DATE-TIME:".length));
      date = Number.isFinite(parsed) ? parsed : null;
    } else if (line.startsWith("#EXTINF:")) {
      lastDuration = Number(line.match(/^#EXTINF:([\d.]+)/)?.[1]) || 0;
      unsafeTail = /amazon/i.test(line);
    } else if (line.startsWith("#EXT-X-DISCONTINUITY") || line.startsWith("#EXT-X-KEY:")) {
      unsafeTail = true;
    } else if (line.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
      const uri = line.slice("#EXT-X-TWITCH-PREFETCH:".length).trim();
      if (unsafeTail || date === null || count >= 2 || existing.has(uri) || !uri) {
        unsafeTail = true;
        return line;
      }
      count++;
      existing.add(uri);
      const programDate = new Date(date).toISOString();
      date += duration * 1_000;
      return `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-STILL-PREFETCH:1\n#EXTINF:${duration.toFixed(6)},live\n${uri}`;
    } else if (line.trim() && !line.startsWith("#")) {
      // A PROGRAM-DATE-TIME may anchor several segments rather than repeat on
      // each one. Advance through complete media before dating the live tail.
      date = date !== null && lastDuration > 0 ? date + lastDuration * 1_000 : null;
    }
    return line;
  }).join("\n");
}

function filterTwitchAdSegments(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  const adRanges: { start: number; end: number }[] = [];
  let pending: string[] = [];
  let pendingProgramDate: number | null = null;
  let pendingDuration = 0;
  let pendingTitle = "";

  const flushPending = () => {
    if (pending.length === 0) return;

    const segmentStart = pendingProgramDate;
    const segmentEnd =
      segmentStart === null ? null : segmentStart + Math.max(0, pendingDuration);
    const isAdByDate =
      segmentStart !== null &&
      segmentEnd !== null &&
      adRanges.some((range) => segmentStart < range.end && segmentEnd > range.start);
    const isAdByTitle = pendingTitle.toLowerCase().includes("amazon");

    if (!isAdByDate && !isAdByTitle) {
      output.push(...pending);
    }

    pending = [];
    pendingProgramDate = null;
    pendingDuration = 0;
    pendingTitle = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#EXT-X-DATERANGE") && isTwitchAdDaterange(trimmed)) {
      const start = parseDateRangeStart(trimmed);
      const duration = parseDateRangeDuration(trimmed);
      if (start !== null && duration !== null) {
        adRanges.push({ start, end: start + duration });
      }
      continue;
    }

    if (trimmed.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      flushPending();
      pending = [line];
      const dateValue = trimmed.slice("#EXT-X-PROGRAM-DATE-TIME:".length);
      const date = Date.parse(dateValue);
      pendingProgramDate = Number.isFinite(date) ? date / 1000 : null;
      continue;
    }

    if (trimmed.startsWith("#EXTINF:")) {
      if (pending.length === 0) pending = [];
      pending.push(line);
      const match = trimmed.match(/^#EXTINF:([\d.]+)(?:,(.*))?$/);
      pendingDuration = match ? Number(match[1]) || 0 : 0;
      pendingTitle = match?.[2] ?? "";
      continue;
    }

    if (pending.length > 0) {
      pending.push(line);
      if (trimmed && !trimmed.startsWith("#")) {
        flushPending();
      }
      continue;
    }

    output.push(line);
  }

  flushPending();

  return output.join("\n");
}

function isTwitchAdDaterange(line: string): boolean {
  return (
    line.includes('CLASS="twitch-stitched-ad"') ||
    line.includes("CLASS=twitch-stitched-ad") ||
    line.includes('ID="stitched-ad-') ||
    line.includes("ID=stitched-ad-")
  );
}

function parseDateRangeStart(line: string): number | null {
  const match = line.match(/START-DATE="([^"]+)"/);
  if (!match) return null;
  const parsed = Date.parse(match[1]);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function parseDateRangeDuration(line: string): number | null {
  const filled = line.match(/X-TV-TWITCH-AD-POD-FILLED-DURATION="?([\d.]+)"?/);
  if (filled) return Number(filled[1]) || null;

  const duration = line.match(/DURATION="?([\d.]+)"?/);
  if (duration) return Number(duration[1]) || null;

  return null;
}

function rewritePlaylistLine(
  line: string,
  playlistUrl: string,
  proxySegments = false
): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  if (!trimmed.startsWith("#")) {
    const absoluteUrl = new URL(trimmed, playlistUrl).toString();
    return proxySegments ? proxyUrl(absoluteUrl) : absoluteUrl;
  }

  if (!trimmed.includes('URI="')) {
    return line;
  }

  return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
    const absoluteUri = new URL(uri, playlistUrl).toString();
    return `URI="${proxySegments ? proxyUrl(absoluteUri) : absoluteUri}"`;
  });
}

function proxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}
