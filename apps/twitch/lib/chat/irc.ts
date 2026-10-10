import { badgeImage, parseChatLine, type ChatMessage } from "./messages.ts";
import { resolveMessageBadges, type BadgeCatalog, type ChatBadge } from "./badges.ts";

export function createLiveChatSession({ channel, updateMessages, onStatus }: {
  channel: string;
  updateMessages: (update: (current: ChatMessage[]) => ChatMessage[]) => void;
  onStatus: (status: string) => void;
}) {
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) return;
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let pending: ChatMessage[] = [];
  let badges: BadgeCatalog = new Map();
  const badgeRequest = new AbortController();
  // Artwork loading must never delay the IRC connection or interrupt chat.
  void fetch(`/api/chat/badges?channel=${encodeURIComponent(channel.toLowerCase())}`, { signal: badgeRequest.signal })
    .then(response => { if (!response.ok) throw new Error("Badges unavailable"); return response.json(); })
    .then((entries: ChatBadge[]) => {
      if (stopped || !Array.isArray(entries)) return;
      badges = new Map(entries.filter(entry => entry && typeof entry.id === "string" && typeof entry.version === "string"
        && typeof entry.title === "string" && typeof entry.imageUrl === "string" && badgeImage(entry.imageUrl))
        .map(entry => [`${entry.id}/${entry.version}`, entry]));
      pending = pending.map(message => resolveMessageBadges(message, badges));
      updateMessages(current => current.map(message => resolveMessageBadges(message, badges)));
    }).catch(() => { /* Keep text chat available when badge metadata fails. */ });
  const seen = new Set<string>();
  const flush = window.setInterval(() => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    updateMessages((current) => [...current, ...batch].slice(-500));
  }, 200);

  function connect() {
    if (stopped) return;
    onStatus(attempts ? "Reconnecting…" : "Connecting…");
    const connection = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    socket = connection;
    connection.onopen = () => {
      if (stopped || socket !== connection) return;
      // https://dev.twitch.tv/docs/chat/irc/ (read-only anonymous connection)
      connection.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      connection.send("PASS SCHMOOPIIE");
      connection.send(`NICK justinfan${Math.floor(100000 + Math.random() * 900000)}`);
      connection.send(`JOIN #${channel.toLowerCase()}`);
    };
    connection.onmessage = (event) => {
      if (stopped || socket !== connection || typeof event.data !== "string") return;
      for (const line of event.data.split("\r\n")) {
        if (line.startsWith("PING ")) {
          connection.send(line.replace(/^PING/, "PONG"));
          continue;
        }
        if (line.includes(" RECONNECT")) { connection.close(); continue; }
        if (line.includes(" 366 ") || line.includes(" ROOMSTATE ")) {
          attempts = 0;
          onStatus("Connected");
        }
        if (line.includes(" CLEARMSG ")) {
          const id = line.match(/(?:^@|;)target-msg-id=([^; ]+)/)?.[1];
          if (id) {
            pending = pending.filter((message) => message.id !== id);
            updateMessages((current) => current.filter((message) => message.id !== id));
          }
          continue;
        }
        if (line.includes(" CLEARCHAT ")) {
          const user = line.match(/ CLEARCHAT #[^ ]+(?: :(.+))?$/)?.[1]?.trim();
          pending = user ? pending.filter((message) => message.user.toLowerCase() !== user.toLowerCase()) : [];
          updateMessages((current) => user ? current.filter((message) => message.user.toLowerCase() !== user.toLowerCase()) : []);
          continue;
        }
        const message = parseChatLine(line);
        if (!message || seen.has(message.id)) continue;
        onStatus("Connected");
        seen.add(message.id);
        if (seen.size > 2000) seen.delete(seen.values().next().value!);
        pending = [...pending, resolveMessageBadges(message, badges)].slice(-150);
      }
    };
    connection.onerror = () => connection.close();
    connection.onclose = () => {
      if (stopped || socket !== connection) return;
      onStatus("Reconnecting…");
      reconnectTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++));
    };
  }
  connect();
  return () => {
    stopped = true;
    badgeRequest.abort();
    clearInterval(flush);
    clearTimeout(reconnectTimer);
    socket?.close();
  };
}
