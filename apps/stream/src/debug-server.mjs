import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  formatEntry,
  sanitizeDebugValue,
  sharedLog,
} from "./debug.mjs";

const STATE_KEY = "__phantomStreamDebugServer";
const TRACE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function state() {
  if (globalThis[STATE_KEY]) return globalThis[STATE_KEY];
  const storage = new AsyncLocalStorage();
  const value = {
    storage,
    installed: false,
    announced: false,
    queue: Promise.resolve(),
  };
  globalThis[STATE_KEY] = value;
  return value;
}

export function serverDebugEnabled(env = process.env) {
  return (
    env.NODE_ENV !== "production" &&
    (env.DEBUG === "1" || env.STREAM_DEBUG === "1")
  );
}

export function debugLogPath(env = process.env) {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    env.STREAM_DEBUG_LOG || ".debug/phantom-stream.ndjson",
  );
}

export function normalizeTraceId(value) {
  const traceId = String(value ?? "");
  return TRACE_ID.test(traceId) ? traceId : null;
}

function enqueue(record) {
  const current = state();
  const output = `${JSON.stringify(sanitizeDebugValue(record))}\n`;
  const target = debugLogPath();
  current.queue = current.queue
    .then(async () => {
      await mkdir(path.dirname(target), { recursive: true });
      await appendFile(target, output, "utf8");
    })
    .catch((error) => {
      console.error(`[stream] Could not append debug trace: ${error.message}`);
    });
  return current.queue;
}

export function appendClientDebugEntries(sessionId, entries) {
  if (!serverDebugEnabled()) return Promise.resolve();
  const safeSessionId = normalizeTraceId(sessionId) ?? "browser";
  return Promise.all(
    entries.slice(0, 200).map((entry) =>
      enqueue({
        at: new Date().toISOString(),
        side: "client",
        sessionId: safeSessionId,
        entry,
      }),
    ),
  );
}

export function installServerDebugSink() {
  if (!serverDebugEnabled()) return false;
  const current = state();
  if (current.installed) return true;
  current.installed = true;

  const log = sharedLog();
  log.setEnabled(true);
  log.setSink((entry) => {
    const context = current.storage.getStore();
    console.log(`[stream] ${formatEntry(entry)}`);
    void enqueue({
      at: new Date().toISOString(),
      side: "server",
      traceId: context?.traceId ?? null,
      entry,
    });
  });

  if (!current.announced) {
    current.announced = true;
    console.log(`[stream] DEBUG=1 trace: ${debugLogPath()}`);
  }
  return true;
}

export function withServerDebugTrace(traceId, callback) {
  const normalized = normalizeTraceId(traceId);
  if (!serverDebugEnabled() || !normalized) return callback();
  return state().storage.run({ traceId: normalized }, callback);
}
