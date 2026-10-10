import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { normalizeBadgeCatalog, type ChatBadge } from "../chat/badges.ts";
import { runQuery } from "./gql.ts";

const catalogs = new ResourceCache<ChatBadge[]>(64, 8 * 1024 * 1024, value => JSON.stringify(value).length * 2);

export function fetchChatBadges(channel: string, signal?: AbortSignal): Promise<ChatBadge[]> {
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) throw new UpstreamError("cap");
  const login = channel.toLowerCase();
  return catalogs.load(login, async () => {
    const data = await runQuery<{ badges: unknown; user: { broadcastBadges: unknown } | null }>(`
      query ChatBadges($login: String!) {
        badges { setID version title imageURL }
        user(login: $login) { broadcastBadges { setID version title imageURL } }
      }`, { login }, { maxBytes: 2 * 1024 * 1024 });
    if (!Array.isArray(data.badges) || (data.user && !Array.isArray(data.user.broadcastBadges))) throw new UpstreamError("schema");
    return normalizeBadgeCatalog(data.badges, data.user?.broadcastBadges);
  }, 3_600_000, signal);
}
