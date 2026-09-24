import { ResolvedQuality } from "./validation";

function buildMediaPlaylistPath(vodId: string, quality: string): string {
  const params = new URLSearchParams({
    vodId,
    quality,
  });
  return `/api/vod/media.m3u8?${params.toString()}`;
}

export function generateMasterPlaylist(
  vodId: string,
  qualities: ResolvedQuality[]
): string {
  let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  for (const q of qualities) {
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},CODECS="${q.codec},mp4a.40.2",RESOLUTION=${q.resolution},FRAME-RATE=${q.frameRate}\n`;
    playlist += `${buildMediaPlaylistPath(vodId, q.key)}\n`;
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

export function rewriteLiveMasterPlaylist(text: string, playlistUrl: string): string {
  const lines = text.split("\n");

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      const params = new URLSearchParams({
        url: new URL(trimmed, playlistUrl).toString(),
      });
      return `/api/live/media.m3u8?${params.toString()}`;
    })
    .join("\n");
}

export function rewriteLiveMediaPlaylist(text: string, playlistUrl: string): string {
  const filtered = filterTwitchAdSegments(text);
  return filtered
    .split("\n")
    .map((line) => rewritePlaylistLine(line, playlistUrl))
    .join("\n");
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
