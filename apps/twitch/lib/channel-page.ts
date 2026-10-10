import { UpstreamError } from "./errors.ts";
import { ResourceCache } from "./cache.ts";
import { isReservedChannelName } from "./seo.ts";
import { fetchChannelBasics } from "./twitch/channels.ts";
import type { TwitchChannelData } from "./contracts.ts";

const CHANNEL_NAME_PATTERN = /^[a-z0-9_]{3,25}$/;

const channels = new ResourceCache<{ channel: TwitchChannelData; observedAt: number }>();

export type ChannelPageResult =
  /** `age` is how long ago Twitch was asked, in milliseconds. Live state older than a moment is worth rechecking. */
  | { status: "ok"; channel: TwitchChannelData; age: number }
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
  try {
    const { channel, observedAt } = await channels.load(key, async () => ({ channel: await fetchChannelBasics(login), observedAt: Date.now() }),
      value => value.channel.stream ? 60_000 : 6 * 60_000);

    return { status: "ok", channel, age: Date.now() - observedAt };
  } catch (error) {
    // Only a genuine miss is a 404. Everything else must not be reported as
    // "gone" or a transient Twitch outage would prune real pages.
    if (error instanceof UpstreamError && error.kind === "not-found") return { status: "missing" };

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
  const summary = `${channel.displayName} is ${status} on Twitch. Watch ad-free or replay VODs without an account, with quality and speed controls on Still.`;

  // displayName is interpolated, so the result can overrun the snippet budget
  // and be cut mid-word. Clamp instead of trusting upstream lengths.
  return summary.length <= DESCRIPTION_BUDGET
    ? summary
    : `${summary.slice(0, DESCRIPTION_BUDGET - 1).trimEnd()}…`;
}
