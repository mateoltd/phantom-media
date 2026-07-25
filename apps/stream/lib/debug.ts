"use client";

import {
  formatEntry,
  sharedLog,
  summarize,
  type DebugChannel,
  type LogEntry,
} from "../src/debug.mjs";

export type { DebugChannel, LogEntry };

/**
 * Switching the log on, and the console you read it in.
 *
 * The buffer and the formatting are in `src/debug.mjs` so they can be tested
 * under `node --test`; what lives here is everything that only means something
 * in a browser — the query parameter, the preference that survives a reload,
 * and the handful of commands worth having at three in the morning when the
 * player is sitting at nought answered and you want to know why.
 *
 * Turn it on with `?debug=1`, and it stays on until `__phantom.off()`. That
 * matters more than it looks: the fault being chased survives page reloads, so
 * an instrument that does not would never be running when it happened.
 */

const STORAGE_KEY = "phantom.stream.debug";
const QUERY_KEY = "debug";

const log = sharedLog();

/** Printing every entry is the point when it is on, and unbearable when it is
 *  not wanted; `quiet()` keeps the buffer and stops the noise. */
let printing = true;

const COLOURS: Record<string, string> = {
  router: "#a78bfa",
  source: "#38bdf8",
  probe: "#818cf8",
  attach: "#34d399",
  score: "#fbbf24",
  relay: "#f472b6",
  subtitles: "#94a3b8",
  route: "#f87171",
};

function readPreference(): boolean | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Storage can be disabled. The query parameter still works.
  }
  return null;
}

function writePreference(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Then it lasts for this page only, which is better than nothing.
  }
}

function detect(): boolean {
  try {
    const query = new URLSearchParams(window.location.search).get(QUERY_KEY);
    if (query !== null) {
      const on = query !== "0" && query !== "false";
      writePreference(on);
      return on;
    }
  } catch {
    // Not a browser context worth reading a URL from.
  }
  const stored = readPreference();
  if (stored !== null) return stored;
  return process.env.NEXT_PUBLIC_STREAM_DEBUG === "1";
}

function print(entry: LogEntry): void {
  if (!printing) return;
  const colour = COLOURS[entry.channel] ?? "#94a3b8";
  console.debug(
    `%c${formatEntry(entry)}`,
    `color:${colour}`,
    entry.data ?? "",
  );
}

export function debugEnabled(): boolean {
  return log.enabled;
}

/** The instrumented call sites use these two and nothing else. */
export function debug(channel: DebugChannel, name: string, data?: unknown): void {
  log.event(channel, name, data);
}

export function span(
  channel: DebugChannel,
  name: string,
  data?: unknown,
): (extra?: unknown) => void {
  return log.span(channel, name, data);
}

/**
 * The response header the resolve route sets when it is asked to. Server
 * timings arriving alongside the response is the only way to tell an upstream
 * that is slow from a route that is queued behind something else.
 */
export const DEBUG_HEADER = "x-phantom-debug";

export function debugRequestHeaders(): HeadersInit | undefined {
  return log.enabled ? { [DEBUG_HEADER]: "1" } : undefined;
}

export function readServerTiming(response: Response): Record<string, string> | null {
  if (!log.enabled) return null;
  const header = response.headers.get(DEBUG_HEADER);
  if (!header) return null;
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, value] = part.split("=");
    if (key) out[key.trim()] = (value ?? "").trim();
  }
  return out;
}

interface DebugConsole {
  on(): string;
  off(): string;
  quiet(): string;
  loud(): string;
  entries(): LogEntry[];
  sources(): void;
  summary(): ReturnType<typeof summarize>;
  dump(): string;
  copy(): Promise<string>;
  clear(): string;
  help(): void;
}

function install(): void {
  const api: DebugConsole = {
    on() {
      writePreference(true);
      log.setEnabled(true);
      return "Debug logging on. Reload to capture the page load as well.";
    },
    off() {
      writePreference(false);
      log.setEnabled(false);
      return "Debug logging off.";
    },
    quiet() {
      printing = false;
      return "Still recording, no longer printing. __phantom.dump() to read it.";
    },
    loud() {
      printing = true;
      return "Printing.";
    },
    entries: () => log.entries(),
    sources() {
      // One row per source per race is the view that answers "what was it
      // doing while the counter said nought".
      const rows = log
        .entries()
        .filter((entry) => entry.channel === "source")
        .map((entry) => ({ at: entry.t, event: entry.event, ...entry.data }));
      console.table(rows);
    },
    summary: () => summarize(log.entries()),
    dump: () =>
      JSON.stringify(
        { stats: log.stats(), summary: summarize(log.entries()), entries: log.entries() },
        null,
        2,
      ),
    async copy() {
      const text = api.dump();
      try {
        await navigator.clipboard.writeText(text);
        return `Copied ${text.length} characters.`;
      } catch {
        return "Clipboard refused. Use __phantom.dump() and copy it by hand.";
      }
    },
    clear() {
      log.clear();
      return "Cleared.";
    },
    help() {
      console.log(
        [
          "__phantom.on() / .off()   record, and remember the choice across reloads",
          "__phantom.quiet() / .loud()  stop or resume printing while still recording",
          "__phantom.sources()       table of every source's progress this session",
          "__phantom.summary()       counts per channel and the twenty slowest spans",
          "__phantom.dump()          the whole buffer as JSON",
          "__phantom.copy()          the same, onto the clipboard",
          "__phantom.clear()         empty the buffer",
        ].join("\n"),
      );
    },
  };

  (window as unknown as { __phantom: DebugConsole }).__phantom = api;
}

if (typeof window !== "undefined") {
  log.setEnabled(detect());
  log.setSink(print);
  install();
  if (log.enabled) {
    console.info(
      "%cPhantom debug logging is on. __phantom.help() for what to do with it.",
      "color:#a78bfa;font-weight:bold",
    );
  }
}
