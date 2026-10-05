import { cacheGet, cacheSet } from "./cache.ts";
import { isReservedChannelName } from "./seo.ts";
import { fetchChannel } from "./twitch.ts";
import type { TwitchChannelData } from "./twitch.ts";

const CHANNEL_NAME_PATTERN = /^[a-z0-9_]{3,25}$/;

export type ChannelPageResult =
  | { status: "ok"; channel: TwitchChannelData }
  /** The channel does not exist, or the path is not a channel at all. */
  | { status: "missing" }
  /** Twitch was unreachable. The channel may well exist. */
  | { status: "error" };

export function normalizeChannelName(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function isValidChannelName(value: string): boolean {
  return CHANNEL_NAME_PATTERN.test(value) && !isReservedChannelName(value);
}

/**
 * Server-side channel lookup for the indexable `/[channelName]` pages.
 *
 * Crawlers hit these paths far more often than humans do, so results are held
 * in the process cache. Live status is volatile and gets a short TTL; offline
 * channels barely change and are cached for longer.
 */
export async function loadChannelPage(login: string): Promise<ChannelPageResult> {
  if (!isValidChannelName(login)) return { status: "missing" };

  const key = `channel-page:${login}`;
  const cached = cacheGet<TwitchChannelData>(key);

  if (cached) return { status: "ok", channel: cached };

  try {
    const channel = await fetchChannel(login);
    cacheSet(key, channel, channel.stream ? 60_000 : 6 * 60_000);

    return { status: "ok", channel };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Only a genuine miss is a 404. Everything else must not be reported as
    // "gone" or a transient Twitch outage would prune real pages.
    if (message.includes("not found")) return { status: "missing" };

    return { status: "error" };
  }
}

/** Search results truncate descriptions at roughly this length. */
const DESCRIPTION_BUDGET = 160;

/**
 * Human-readable summary used for the channel meta description.
 *
 * The channel's own bio is deliberately not interpolated here: it is already on
 * the page as visible content, and bios run long enough that they would only
 * push the useful part out of the snippet.
 */
export function buildChannelDescription(channel: TwitchChannelData): string {
  const status = channel.stream ? "live now" : "offline right now";
  const summary = `${channel.displayName} is ${status} on Twitch. Watch ad-free or replay VODs without an account, with quality and speed controls on Phantom Twitch.`;

  // displayName is interpolated, so the result can overrun the snippet budget
  // and be cut mid-word. Clamp instead of trusting upstream lengths.
  return summary.length <= DESCRIPTION_BUDGET
    ? summary
    : `${summary.slice(0, DESCRIPTION_BUDGET - 1).trimEnd()}…`;
}
