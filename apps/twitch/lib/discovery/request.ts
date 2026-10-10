import { recentChannelLogins, type DiscoveryHistory } from "./ranking.ts";

export type LoadError = { message: string; retryAt: number; terminal?: boolean };

export function discoveryRequestBody(entries: DiscoveryHistory[]) {
  return JSON.stringify({
    channels: recentChannelLogins(entries),
    history: entries.slice(0, 30).map(({ channel, vodId, timestamp, title }) => ({ channel, vodId, timestamp, title })),
  });
}

/** Metadata backfill is not a new visit and must not cancel an in-flight feed. */
export function discoveryRequestKey(entries: DiscoveryHistory[]) {
  return JSON.stringify([recentChannelLogins(entries), entries.slice(0, 30).map(({ channel, vodId, timestamp }) => [channel.toLowerCase(), vodId, timestamp])]);
}

export async function discoveryResponse(response: Response) {
  if (!response.ok) {
    const terminal = response.status >= 400 && response.status < 500 && response.status !== 429;
    let message = response.status === 429 ? "Taking a short break. More streams will be available shortly." : "More streams couldn’t be loaded.";
    if (terminal) {
      message = response.status === 403 ? "Twitch is blocking stream discovery. Please try again later." : "The stream discovery request was rejected. Reload the page to try again.";
      // Only surface known validation reasons, never arbitrary upstream response text.
      const body = await response.json().catch(() => null);
      if (["Invalid channels", "Invalid discovery request JSON", "Invalid discovery request", "Invalid discovery cursor or languages"].includes(body?.error)) {
        message = `Streams couldn’t be loaded: ${body.error}. Reload the page to try again.`;
      }
    }
    const delay = Number(response.headers.get("Retry-After"));
    throw { message, retryAt: terminal ? 0 : Date.now() + (Number.isFinite(delay) && delay > 0 ? delay : 15) * 1000, terminal } satisfies LoadError;
  }
  return response.json();
}
