
export const DEFAULT_LIMIT = 2_000;

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

const SECRET_KEY =
  /(?:authorization|cookie|password|secret|signature|token|target|credential|api[-_]?key)/i;
const URL_VALUE = /\bhttps?:\/\/[^\s"'<>]+/gi;

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function redactString(value) {
  const withoutUrls = value.replace(URL_VALUE, (match) => safeUrl(match));
  return withoutUrls.length > 1_024
    ? `${withoutUrls.slice(0, 1_024)}…[truncated]`
    : withoutUrls;
}

export function sanitizeDebugValue(value, depth = 0, key = "") {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? round(value) : String(value);
  if (type === "string") return redactString(value);
  if (type === "boolean") return value;
  if (type === "bigint" || type === "symbol" || type === "function") {
    return `[${type}]`;
  }
  if (depth >= 6) return "[deep]";
  if (Array.isArray(value)) {
    return value
      .slice(0, 32)
      .map((entry) => sanitizeDebugValue(entry, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (type === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return `[${value.constructor?.name ?? "object"}]`;
    }
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeDebugValue(entry, depth + 1, key);
    }
    return out;
  }
  return String(value);
}

function round(value) {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

export function createEventLog(options = {}) {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const clock = options.clock ?? (() => Date.now());
  const origin = clock();

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
      data: data === undefined ? null : sanitizeDebugValue(data),
    };
    push(entry);
    if (sink) {
      try {
        sink(entry);
      } catch {
      }
    }
    return entry;
  };

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

const GLOBAL_KEY = "__phantomStreamLog";

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
    return (
      globalThis.process?.env?.DEBUG === "1" ||
      globalThis.process?.env?.STREAM_DEBUG === "1"
    );
  } catch {
    return false;
  }
}

export function debugEvent(channel, name, data) {
  return sharedLog().event(channel, name, data);
}

export function debugSpan(channel, name, data) {
  return sharedLog().span(channel, name, data);
}
