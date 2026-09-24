export interface ResolvedQuality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
  playlistUrl: string;
}

export interface VodResolveResult {
  vodId: string;
  channel: string;
  broadcastType: string;
  qualities: ResolvedQuality[];
}

export function extractVodId(input: string): string | null {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) return trimmed;

  const pathMatch = trimmed.match(/(?:^|\/+)videos\/(\d+)(?:[/?#]|$)/i);
  if (pathMatch) return pathMatch[1];

  return null;
}

export function extractChannelName(input: string): string | null {
  const trimmed = input.trim().replace(/^@/, "");
  if (!trimmed) return null;

  if (/^[a-z0-9_]{3,25}$/i.test(trimmed)) return trimmed.toLowerCase();

  try {
    const url = new URL(trimmed);
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    if (firstPath && /^[a-z0-9_]{3,25}$/i.test(firstPath)) {
      return firstPath.toLowerCase();
    }
  } catch {}

  return null;
}

export function parseStartTime(value: string | null): number {
  if (!value) return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return Math.floor(parsed);
}

export function buildVodPath(vodId: string, startTime = 0): string {
  const params = new URLSearchParams();
  const normalizedTime = parseStartTime(String(startTime || ""));

  if (normalizedTime > 0) {
    params.set("t", normalizedTime.toString());
  }

  const query = params.toString();
  return query ? `/videos/${vodId}?${query}` : `/videos/${vodId}`;
}

export function buildChannelPath(channel: string): string {
  return `/${encodeURIComponent(channel.toLowerCase())}`;
}

export function isCloudFrontUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".cloudfront.net");
  } catch {
    return false;
  }
}
