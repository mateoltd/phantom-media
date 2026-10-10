import { badgeImage, type ChatMessage } from "./messages.ts";

export type ChatBadge = NonNullable<ChatMessage["badges"]>[number];
export type BadgeCatalog = Map<string, ChatBadge>;

/** Global definitions first, then channel-specific subscriber/cheer overrides. */
export function normalizeBadgeCatalog(global: unknown, channel: unknown): ChatBadge[] {
  const catalog: BadgeCatalog = new Map();
  for (const entries of [global, channel]) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries.slice(0, 5000)) {
      if (!entry || typeof entry.setID !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.setID)
        || typeof entry.version !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.version)) continue;
      const imageUrl = typeof entry.imageURL === "string" ? badgeImage(entry.imageURL) : undefined;
      if (!imageUrl) continue;
      const badge = { id: entry.setID, version: entry.version,
        title: typeof entry.title === "string" ? entry.title.slice(0, 200) : entry.setID, imageUrl };
      catalog.set(`${badge.id}/${badge.version}`, badge);
    }
  }
  return [...catalog.values()];
}

export function resolveMessageBadges(message: ChatMessage, catalog: BadgeCatalog): ChatMessage {
  return { ...message, badges: message.badges?.map(badge => catalog.get(`${badge.id}/${badge.version}`) ?? badge) };
}
