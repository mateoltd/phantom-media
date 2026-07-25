/**
 * A record of what the player actually did, kept so a slow start can be looked
 * at after it happened rather than reproduced on demand.
 *
 * The problem this exists for is a race that occasionally sits at nought
 * answered for a minute and then behaves perfectly on the next attempt. Nothing
 * about that is reproducible to order, so the only useful instrument is one
 * that is already running when it happens: a ring buffer that costs nothing
 * while switched off, and every timing worth having while it is on.
 *
 * Deliberately free of node builtins and of the DOM: the browser bundle, the
 * route handler and `node --test` all import this.
 */

/** Roughly ten minutes of a busy race. Old entries fall off the front. */
export const DEFAULT_LIMIT = 2_000;

/**
 * Channels exist so a dump can be read. They are declared rather than
 * free-form because a typo in a channel name is otherwise invisible: the entry
 * is written, and then never matches the filter anybody searches with.
 */
export const CHANNELS = Object.freeze([
  "router",
  "source",
  "probe",
  "attach",
  "score",
  "relay",
  "subtitles",
  "route",
]);

const CHANNEL_SET = new Set(CHANNELS);

/**
 * Values that survive `JSON.stringify` and mean something to a person reading
 * a dump. Anything else is described rather than serialised, so one accidental
 * DOM node in a payload cannot turn a log into a memory leak.
 */
function plain(value, depth = 0) {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? round(value) : String(value);
  if (type === "string" || type === "boolean") return value;
  if (type === "bigint" || type === "symbol" || type === "function") {
    return `[${type}]`;
  }
  if (depth >= 3) return "[deep]";
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((entry) => plain(entry, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (type === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return `[${value.constructor?.name ?? "object"}]`;
    }
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = plain(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Sub-millisecond precision is noise in a log measured against a network. */
function round(value) {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

/**
 * One log. Created rather than imported as a singleton so tests can hold their
 * own, and so the clock can be handed in.
 */
export function createEventLog(options = {}) {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const clock = options.clock ?? (() => Date.now());
  const origin = clock();

  /** A circular buffer: a busy race must not be paying for `Array#shift`. */
  const ring = new Array(limit);
  let count = 0;
  let head = 0;
  let seq = 0;
  let dropped = 0;
  let enabled = options.enabled ?? false;
  let sink = options.sink ?? null;

  const push = (entry) => {
    ring[head] = entry;
    head = (head + 1) % limit;
    if (count < limit) count += 1;
    else dropped += 1;
  };

  const event = (channel, name, data) => {
    if (!enabled) return;
    const entry = {
      seq: seq++,
      t: round(clock() - origin),
      channel: CHANNEL_SET.has(channel) ? channel : "router",
      event: name,
      data: data === undefined ? null : plain(data),
    };
    push(entry);
    if (sink) {
      try {
        sink(entry);
      } catch {
        // A sink that throws must not take the thing it was watching with it.
      }
    }
    return entry;
  };

  /**
   * Marks the start of something and returns the function that ends it. The
   * duration is the point: a log of what happened without how long it took
   * cannot answer the only question being asked of it.
   */
  const span = (channel, name, data) => {
    if (!enabled) return () => undefined;
    const startedAt = clock();
    event(channel, `${name}.start`, data);
    let ended = false;
    return (extra) => {
      if (ended) return undefined;
      ended = true;
      return event(channel, `${name}.end`, {
        ...(extra ?? {}),
        ms: round(clock() - startedAt),
      });
    };
  };

  const entries = () => {
    const out = [];
    const start = count < limit ? 0 : head;
    for (let index = 0; index < count; index += 1) {
      out.push(ring[(start + index) % limit]);
    }
    return out;
  };

  return {
    event,
    span,
    entries,
    get enabled() {
      return enabled;
    },
    setEnabled(next) {
      enabled = Boolean(next);
      return enabled;
    },
    setSink(next) {
      sink = typeof next === "function" ? next : null;
    },
    clear() {
      count = 0;
      head = 0;
      dropped = 0;
    },
    stats() {
      return { kept: count, dropped, limit, emitted: seq };
    },
  };
}

/** One line, aligned enough to scan a column of them. */
export function formatEntry(entry) {
  const time = `${String(Math.round(entry.t)).padStart(6)}ms`;
  const label = `${entry.channel}/${entry.event}`;
  const data = entry.data ? ` ${formatData(entry.data)}` : "";
  return `${time}  ${label.padEnd(22)}${data}`;
}

function formatData(data) {
  if (typeof data !== "object" || Array.isArray(data)) return JSON.stringify(data);
  return Object.entries(data)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

function formatValue(value) {
  if (value === null) return "null";
  if (typeof value === "string") return value.includes(" ") ? `"${value}"` : value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The shape of a session, for pasting into a report.
 *
 * Counts per channel say what the run spent its time on; the slowest spans say
 * where. Both are computed from the buffer rather than tracked as they happen,
 * so switching the log on costs one array walk and nothing before that.
 */
export function summarize(entries) {
  const channels = {};
  const slowest = [];
  let span = 0;

  for (const entry of entries) {
    channels[entry.channel] = (channels[entry.channel] ?? 0) + 1;
    span = Math.max(span, entry.t);
    const ms = entry.data && typeof entry.data.ms === "number" ? entry.data.ms : null;
    if (ms !== null) {
      slowest.push({ at: entry.t, event: `${entry.channel}/${entry.event}`, ms, data: entry.data });
    }
  }

  slowest.sort((left, right) => right.ms - left.ms);
  return { entries: entries.length, spanMs: round(span), channels, slowest: slowest.slice(0, 20) };
}

/* -------------------------------------------------------------------------- */
/* The shared log                                                             */
/* -------------------------------------------------------------------------- */

const GLOBAL_KEY = "__phantomStreamLog";

/**
 * One log per realm, reached from anywhere without threading it through every
 * call site. The browser bundle and the route handler are different realms and
 * therefore different logs, which is correct: they have different clocks and
 * the server's is shared between everyone connected to it.
 *
 * Held on `globalThis` rather than in a module variable so a development hot
 * reload does not silently start a second one and split the record in half.
 */
export function sharedLog() {
  const existing = globalThis[GLOBAL_KEY];
  if (existing) return existing;
  const log = createEventLog({ enabled: detectEnabled() });
  globalThis[GLOBAL_KEY] = log;
  return log;
}

function detectEnabled() {
  if (globalThis.__phantomDebug === true) return true;
  try {
    return Boolean(globalThis.process?.env?.STREAM_DEBUG);
  } catch {
    return false;
  }
}

/** Shorthand, so an instrumented call site is one line rather than three. */
export function debugEvent(channel, name, data) {
  return sharedLog().event(channel, name, data);
}

export function debugSpan(channel, name, data) {
  return sharedLog().span(channel, name, data);
}
