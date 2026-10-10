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

export function parseStartTime(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;

  return Math.floor(parsed);
}

export function buildVodPath(vodId: string, startTime?: number): string {
  const params = new URLSearchParams();
  const normalizedTime = parseStartTime(startTime === undefined ? null : String(startTime));

  if (normalizedTime !== undefined) {
    params.set("t", normalizedTime.toString());
  }

  const query = params.toString();
  return query ? `/videos/${vodId}?${query}` : `/videos/${vodId}`;
}

export function buildChannelPath(channel: string): string {
  return `/${encodeURIComponent(channel.toLowerCase())}`;
}

export function extractClipSlug(input: string): string | null {
  const value = input.trim();
  const local = /^\/clips\/([A-Za-z0-9_-]{1,150})(?:[?#].*)?$/.exec(value);
  if (local) return local[1];
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = url.hostname === "clips.twitch.tv" ? parts[0] : /^(www\.)?twitch\.tv$/.test(url.hostname) && parts[1] === "clip" ? parts[2] : undefined;
    return slug && /^[A-Za-z0-9_-]{1,150}$/.test(slug) ? slug : null;
  } catch { return null; }
}
