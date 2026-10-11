export interface ChatPoll {
  id: string;
  title: string;
  status: "active" | "ended" | "archived";
  /** Epoch milliseconds on Twitch's clock. */
  startedAt: number;
  /** The scheduled close while the poll runs, the actual one once it has ended. */
  endsAt: number;
  votes: number;
  choices: { id: string; title: string; votes: number }[];
}

/** What the channel's poll looked like from `at` onward. */
export interface PollSnapshot { at: number; poll: ChatPoll }

/** Results stay up this long after a poll closes unless Twitch retires them sooner. */
export const POLL_RESULTS_LINGER = 60_000;
const POLL_HISTORY_LIMIT = 4000;

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw | null => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : null;
const identity = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : "";
const label = (value: unknown, limit: number) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
const total = (value: unknown) => {
  const votes = record(value)?.total;
  return typeof votes === "number" && Number.isFinite(votes) && votes > 0 ? Math.floor(votes) : 0;
};
const instant = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;

/** Reads Twitch's GraphQL poll and its PubSub twin, which differ only in key spelling. */
export function normalizePoll(value: unknown): ChatPoll | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.choices)) return null;
  const id = identity(raw.id ?? raw.poll_id), title = label(raw.title, 200);
  const startedAt = instant(raw.startedAt ?? raw.started_at), endedAt = instant(raw.endedAt ?? raw.ended_at);
  const duration = Number(raw.durationSeconds ?? raw.duration_seconds);
  const choices = raw.choices.slice(0, 10).flatMap(entry => {
    const choice = record(entry), choiceId = identity(choice?.id ?? choice?.choice_id), choiceTitle = label(choice?.title, 100);
    return choice && choiceId && choiceTitle ? [{ id: choiceId, title: choiceTitle, votes: total(choice.votes) }] : [];
  });
  if (!id || !title || choices.length < 2 || !Number.isFinite(startedAt) || !Number.isFinite(duration) || duration < 0 || duration > 86_400) return null;
  const status = raw.status === "ACTIVE" ? "active" : raw.status === "COMPLETED" || raw.status === "TERMINATED" ? "ended" : "archived";
  return {
    id, title, status, startedAt,
    endsAt: status !== "active" && Number.isFinite(endedAt) ? endedAt : startedAt + duration * 1000,
    votes: choices.reduce((sum, choice) => sum + choice.votes, 0), choices,
  };
}

/** Validates a poll that already went through `normalizePoll` on the server. */
export function readPoll(value: unknown): ChatPoll | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.choices) || !identity(raw.id) || typeof raw.title !== "string"
    || (raw.status !== "active" && raw.status !== "ended") || !Number.isFinite(raw.startedAt) || !Number.isFinite(raw.endsAt)) return null;
  const choices = raw.choices.slice(0, 10).flatMap(entry => {
    const choice = record(entry);
    return choice && identity(choice.id) && typeof choice.title === "string" && Number.isFinite(choice.votes)
      ? [{ id: choice.id as string, title: label(choice.title, 100), votes: Math.max(0, Math.floor(choice.votes as number)) }] : [];
  });
  if (choices.length < 2) return null;
  return {
    id: raw.id as string, title: label(raw.title, 200), status: raw.status, startedAt: raw.startedAt as number, endsAt: raw.endsAt as number,
    votes: choices.reduce((sum, choice) => sum + choice.votes, 0), choices,
  };
}

/** A PubSub `polls.<channel>` message. Twitch retires a poll with POLL_ARCHIVE. */
export function parsePollEvent(payload: unknown): ChatPoll | null {
  let event: Raw | null;
  try { event = record(typeof payload === "string" ? JSON.parse(payload) : payload); } catch { return null; }
  if (!event || typeof event.type !== "string" || !event.type.startsWith("POLL_")) return null;
  const poll = normalizePoll(record(event.data)?.poll);
  return poll && event.type === "POLL_ARCHIVE" ? { ...poll, status: "archived" } : poll;
}

/** Appends in time order. A channel shows one poll at a time, so one timeline covers it. */
export function recordPoll(history: PollSnapshot[], poll: ChatPoll, at: number): PollSnapshot[] {
  const last = history.at(-1);
  return [...history, { at: last ? Math.max(at, last.at) : at, poll }].slice(-POLL_HISTORY_LIMIT);
}

/** The poll a viewer would have seen at `at`, or null when none was on screen. */
export function pollAt(history: PollSnapshot[], at: number): ChatPoll | null {
  let poll: ChatPoll | undefined;
  for (const snapshot of history) {
    if (snapshot.at > at) {
      // A poll already running when the session began is only known from its first sighting.
      if (!poll && snapshot.poll.startedAt <= at) poll = snapshot.poll;
      break;
    }
    poll = snapshot.poll;
  }
  if (!poll || poll.status === "archived" || at < poll.startedAt || at > poll.endsAt + POLL_RESULTS_LINGER) return null;
  // The moment decides whether it reads as running: a poll first sighted after it closed was still open before that.
  const status = at >= poll.endsAt ? "ended" : "active";
  return poll.status === status ? poll : { ...poll, status };
}

/** Whole percentages that add up to 100, with the remainder going to the largest fractions. */
export function pollShares(poll: ChatPoll): number[] {
  if (!poll.votes) return poll.choices.map(() => 0);
  const exact = poll.choices.map(choice => choice.votes / poll.votes * 100);
  const shares = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, rest: value - shares[index] })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let spare = 100 - shares.reduce((sum, share) => sum + share, 0), next = 0; spare > 0; spare--, next++) shares[order[next].index]++;
  return shares;
}
