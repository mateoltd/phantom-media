import { parsePollEvent, readPoll, recordPoll, type PollSnapshot } from "./polls.ts";

export interface PollState {
  history: PollSnapshot[];
  /** Local clock minus Twitch's, so `Date.now() - skew` reads on the timeline of `history`. */
  skew: number;
}

// The public client ID twitch.tv itself sends for signed-out viewers.
const HERMES = "wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko";
// The snapshot route is cached on the server and at the edge, five seconds each.
const SNAPSHOT_STALENESS = 10_000;
const token = () => Math.random().toString(36).slice(2, 14);

// Polls travel on Twitch's PubSub rather than IRC. Votes only produce a message
// when they change, so each connection starts from a snapshot of the poll in
// progress, follows the socket, and reads the snapshot once more after
// subscribing to cover what happened in between.
export function createPollSession({ channel, initial, onChange }: {
  channel: string;
  /** What an earlier session for this channel had gathered. */
  initial?: PollState;
  onChange: (state: PollState) => void;
}) {
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) return;
  const login = channel.toLowerCase();
  let stopped = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let handoff: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let history = initial?.history ?? [];
  let skew = initial?.skew ?? 0;
  // Snapshots stamped by the local clock since Twitch last told us its own.
  let estimated = new Set<PollSnapshot>();
  const requests = new AbortController();
  const now = () => Date.now() - skew;
  const publish = () => onChange({ history, skew });
  const retry = (task: () => void) => {
    clearTimeout(timer);
    timer = setTimeout(task, Math.min(60_000, 1000 * 2 ** attempts++));
  };

  /** Twitch's clock is the timeline. Move what the local clock stamped onto it. */
  function synchronize(sent: number) {
    const correction = Date.now() - sent - skew;
    skew += correction;
    if (estimated.size) {
      history = history.map(entry => estimated.has(entry) ? { ...entry, at: entry.at - correction } : entry).sort((a, b) => a.at - b.at);
    }
    estimated = new Set();
    publish();
  }

  /** Resolves to the channel ID, to undefined after a passing failure, or to null when the channel cannot be read. */
  async function snapshot(): Promise<string | null | undefined> {
    const asked = Date.now();
    try {
      const response = await fetch(`/api/chat/poll?channel=${encodeURIComponent(login)}`, { signal: requests.signal, cache: "no-store" });
      if (response.status === 400 || response.status === 404) return null;
      if (!response.ok) return undefined;
      const data = await response.json();
      if (typeof data?.channelId !== "string" || !/^\d{1,20}$/.test(data.channelId)) return undefined;
      if (stopped) return data.channelId;
      const poll = readPoll(data.poll), last = history.at(-1);
      // The answer can predate anything reported in the moments before it was asked for.
      // The socket is the newer source for those, and the read after subscribing follows up.
      if (last && last.at > asked - skew - SNAPSHOT_STALENESS) return data.channelId;
      // An empty answer means the poll we last saw was retired while we were not listening.
      const seen = poll ?? (last && last.poll.status !== "archived" ? { ...last.poll, status: "archived" as const } : null);
      if (!seen || (last && last.poll.id === seen.id && last.poll.status === seen.status && last.poll.votes === seen.votes)) return data.channelId;
      history = recordPoll(history, seen, now());
      estimated.add(history.at(-1)!);
      publish();
      return data.channelId;
    } catch { return undefined; }
  }

  async function start() {
    if (stopped) return;
    const channelId = await snapshot();
    if (stopped || channelId === null) return;
    if (channelId) connect(channelId);
    else retry(() => void start());
  }

  function connect(channelId: string) {
    const connection = new WebSocket(HERMES);
    socket = connection;
    const reconnect = () => {
      if (stopped || socket !== connection) return;
      socket = null;
      clearTimeout(watchdog);
      clearTimeout(handoff);
      connection.close();
      retry(() => void start());
    };
    // Twitch sends a keepalive on the interval it announces; silence means a dead socket.
    const expect = (seconds: number) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(reconnect, (seconds * 2 + 5) * 1000);
    };
    let keepalive = 15;
    expect(keepalive);
    connection.onmessage = (event) => {
      if (stopped || socket !== connection || typeof event.data !== "string") return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== "object") return;
      const sent = Date.parse(message.timestamp);
      expect(keepalive);
      if (message.type === "welcome") {
        attempts = 0;
        if (Number.isFinite(sent)) synchronize(sent);
        const seconds = message.welcome?.keepaliveSec;
        if (typeof seconds === "number" && seconds > 0 && seconds <= 120) keepalive = seconds;
        connection.send(JSON.stringify({
          type: "subscribe", id: token(), timestamp: new Date().toISOString(),
          subscribe: { id: token(), type: "pubsub", pubsub: { topic: `polls.${channelId}` } },
        }));
      } else if (message.type === "subscribeResponse") {
        if (message.subscribeResponse?.result !== "ok") { reconnect(); return; }
        // A poll opened or closed between the first snapshot and this point reached neither.
        // Read again once every cached copy of the snapshot is younger than the subscription.
        clearTimeout(handoff);
        handoff = setTimeout(() => void snapshot(), SNAPSHOT_STALENESS + 2000);
      } else if (message.type === "reconnect") reconnect();
      else if (message.type === "notification") {
        const poll = parsePollEvent(message.notification?.pubsub);
        if (!poll) return;
        history = recordPoll(history, poll, Number.isFinite(sent) ? sent : now());
        publish();
      }
    };
    connection.onerror = reconnect;
    connection.onclose = reconnect;
  }

  void start();
  return () => {
    stopped = true;
    requests.abort();
    clearTimeout(timer);
    clearTimeout(watchdog);
    clearTimeout(handoff);
    socket?.close();
  };
}

interface Watched { state: PollState; listeners: Set<() => void>; stop?: () => void; release?: ReturnType<typeof setTimeout> }
const NO_POLLS: PollState = { history: [], skew: 0 };
const watched = new Map<string, Watched>();

/** What this page has seen of a channel's polls, whoever was listening at the time. */
export function channelPolls(channel: string): PollState {
  return watched.get(channel.toLowerCase())?.state ?? NO_POLLS;
}

// Twitch cannot give a retired poll back, so what was seen outlives the chat
// view that saw it: switching between replay and live chat, or closing and
// reopening the panel, continues one timeline. A brief pause before
// disconnecting lets such a switch keep the same socket.
export function watchChannelPolls(channel: string, listener: () => void): () => void {
  const login = channel.toLowerCase();
  let entry = watched.get(login);
  if (!entry) {
    for (const [key, other] of watched) if (watched.size >= 8 && !other.listeners.size && !other.release) watched.delete(key);
    entry = { state: NO_POLLS, listeners: new Set() };
    watched.set(login, entry);
  }
  const current = entry;
  clearTimeout(current.release);
  current.release = undefined;
  current.listeners.add(listener);
  current.stop ??= createPollSession({ channel: login, initial: current.state, onChange: (state) => {
    current.state = state;
    for (const notify of current.listeners) notify();
  } });
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size || !current.stop) return;
    current.release = setTimeout(() => {
      current.release = undefined;
      current.stop?.();
      current.stop = undefined;
    }, 5000);
  };
}
