export interface ChatMessage {
  id: string;
  user: string;
  color: string;
  text: string;
  offset?: number;
  userId?: string;
  fragments?: { text: string; emoteId?: string }[];
  badges?: { id: string; version: string; title: string; imageUrl?: string }[];
}

const CHAT_MAX_TEXT_LENGTH = 1000;
const CHAT_MAX_USER_LENGTH = 32;

export function parseChatLine(line: string): ChatMessage | null {
  const privmsgIndex = line.indexOf(" PRIVMSG ");
  if (privmsgIndex === -1) return null;

  const messageStart = line.indexOf(" :", privmsgIndex);
  if (messageStart === -1) return null;

  const tags = line.startsWith("@") ? parseIrcTags(line.slice(1, line.indexOf(" "))) : {};
  const prefixStart = line.startsWith("@") ? line.indexOf(" :") + 2 : 1;
  const prefixEnd = line.indexOf("!", prefixStart);
  const prefixUser =
    prefixStart > 0 && prefixEnd > prefixStart ? line.slice(prefixStart, prefixEnd) : "";
  const user = sanitizeChatUser(tags["display-name"] || prefixUser || "viewer");
  const text = sanitizeChatText(line.slice(messageStart + 2));

  if (!text) return null;

  return {
    id: sanitizeChatId(tags.id) || `${Date.now()}-${Math.random()}`,
    user,
    color: sanitizeChatColor(tags.color) || chatColor(user),
    text,
    badges: (tags.badges ?? "").split(",").flatMap(value => {
      const match = value.match(/^([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})$/);
      return match ? [{ id: match[1], version: match[2], title: match[1] }] : [];
    }).slice(0, 12),
  };
}

function parseIrcTags(value: string) {
  const tags: Record<string, string> = {};

  for (const pair of value.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    tags[pair.slice(0, separator)] = decodeIrcTag(pair.slice(separator + 1));
  }

  return tags;
}

function decodeIrcTag(value: string) {
  return value
    .replaceAll("\\s", " ")
    .replaceAll("\\:", ";")
    .replaceAll("\\r", "\r")
    .replaceAll("\\n", "\n")
    .replaceAll("\\\\", "\\");
}

function sanitizeChatUser(value: string) {
  const cleaned = value
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, CHAT_MAX_USER_LENGTH);

  return cleaned || "viewer";
}

function sanitizeChatText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, CHAT_MAX_TEXT_LENGTH);
}

function sanitizeChatId(value?: string) {
  if (!value) return "";
  return /^[a-zA-Z0-9-]{1,64}$/.test(value) ? value : "";
}

export function sanitizeChatColor(value?: string) {
  if (!value) return "";
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
}

export function chatColor(value: string) {
  const colors = ["#95a7c3", "#70e0a3", "#e0c070", "#e87070", "#b79cff", "#70c7e0"];
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) % colors.length;
  }

  return colors[hash];
}


export function mergeReplayMessages(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0)).slice(-1500);
}

export function messagesAtTime(messages: ChatMessage[], time: number): ChatMessage[] {
  return messages.filter((message) => (message.offset ?? 0) <= time).slice(-150);
}

export interface ReplayNode {
  id: string;
  contentOffsetSeconds: number;
  commenter: { id?: string; displayName?: string; login?: string } | null;
  message: { fragments: { text: string; emote?: { id: string } | null }[]; userColor: string | null; userBadges?: { id: string; version: string; title?: string; imageURL?: string }[] };
}
export function badgeImage(value: string | undefined): string | undefined {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && url.hostname === "static-cdn.jtvnw.net" && /^\/badges\/v1\/[a-z0-9-]+\/[123]$/.test(url.pathname) ? url.href : undefined; } catch { return undefined; }
}
export function emoteImage(id: string): string | undefined {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0` : undefined;
}
export function normalizeReplayNode(node: ReplayNode): ChatMessage | null {
  if (!node || typeof node.id !== "string" || !Number.isFinite(node.contentOffsetSeconds) || node.contentOffsetSeconds < 0 || !Array.isArray(node.message?.fragments)) return null;
  const user = node.commenter?.displayName || node.commenter?.login || "Deleted user";
  const fragments = node.message.fragments.filter(fragment => typeof fragment.text === "string").map(fragment => ({ text: sanitizeChatText(fragment.text), emoteId: fragment.emote?.id && emoteImage(fragment.emote.id) ? fragment.emote.id : undefined }));
  const badges = (node.message.userBadges ?? []).flatMap(badge => {
    if (!badge || !badge.id || badge.id === "Ozs=") return [];
    return [{ id: badge.id, version: badge.version, title: badge.title ?? "Badge", imageUrl: badgeImage(badge.imageURL) }];
  }).slice(0, 12);
  return { id: node.id, user, userId: node.commenter?.id ?? node.commenter?.login,
    color: sanitizeChatColor(node.message.userColor ?? "") || chatColor(user),
    text: fragments.map(fragment => fragment.text).join(""), fragments, badges, offset: node.contentOffsetSeconds };
}
