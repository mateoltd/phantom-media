import { parsePollEvent, readPoll, recordPoll, type PollSnapshot } from "./polls.ts";

export interface PollState {
  history: PollSnapshot[];
  /** Local clock minus Twitch's, so `Date.now() - skew` reads on the timeline of `history`. */
  skew: number;
}

// The public client ID twitch.tv itself sends for signed-out viewers.
const HERMES = "wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko";
const token = () => Math.random().toString(36).slice(2, 14);

// Polls travel on Twitch's PubSub rather than IRC. Votes only produce a message
// when they change, so each connection starts from a snapshot of the poll in
// progress and then follows the socket.
export function createPollSession({ channel, onChange }: {
  channel: string;
  onChange: (state: PollState) => void;
}) {
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) return;
  const login = channel.toLowerCase();
  let stopped = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let history: PollSnapshot[] = [];
  let skew = 0;
  const requests = new AbortController();
  const now = () => Date.now() - skew;
  const publish = () => onChange({ history, skew });
  const retry = (task: () => void) => {
    clearTimeout(timer);
    timer = setTimeout(task, Math.min(60_000, 1000 * 2 ** attempts++));
  };

  /** Resolves to the channel ID, to undefined after a passing failure, or to null when the channel cannot be read. */
  async function snapshot(): Promise<string | null | undefined> {
    const asked = now();
    try {
      const response = await fetch(`/api/chat/poll?channel=${encodeURIComponent(login)}`, { signal: requests.signal });
      if (response.status === 400 || response.status === 404) return null;
      if (!response.ok) return undefined;
      const data = await response.json();
      if (typeof data?.channelId !== "string" || !/^\d{1,20}$/.test(data.channelId)) return undefined;
      if (stopped) return data.channelId;
      const poll = readPoll(data.poll), last = history.at(-1);
      let next = history;
      // The socket is the newer source for anything it reported while this was in flight.
      if (poll && (!last || last.at <= asked)) next = recordPoll(history, poll, now());
      // An empty answer means the poll we last saw was retired while we were not listening.
      // The answer can be a few seconds old, so a poll that just opened is left alone.
      else if (!poll && last && last.poll.status !== "archived" && last.at <= asked - 10_000) {
        next = recordPoll(history, { ...last.poll, status: "archived" }, now());
      }
      if (next !== history) { history = next; publish(); }
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
      if (Number.isFinite(sent)) skew = Date.now() - sent;
      expect(keepalive);
      if (message.type === "welcome") {
        attempts = 0;
        const seconds = message.welcome?.keepaliveSec;
        if (typeof seconds === "number" && seconds > 0 && seconds <= 120) keepalive = seconds;
        connection.send(JSON.stringify({
          type: "subscribe", id: token(), timestamp: new Date().toISOString(),
          subscribe: { id: token(), type: "pubsub", pubsub: { topic: `polls.${channelId}` } },
        }));
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
    socket?.close();
  };
}
