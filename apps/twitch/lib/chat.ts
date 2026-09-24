export interface ChatMessage {
  id: string;
  user: string;
  color: string;
  text: string;
  offset?: number;
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
