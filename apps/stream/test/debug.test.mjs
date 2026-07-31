import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNELS,
  createEventLog,
  formatEntry,
  sanitizeDebugValue,
  summarize,
} from "../src/debug.mjs";
import {
  normalizeTraceId,
  serverDebugEnabled,
} from "../src/debug-server.mjs";

function fixedClock() {
  let now = 1_000;
  return {
    read: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("records nothing at all while it is switched off", () => {
  const log = createEventLog({ enabled: false });
  log.event("router", "start", { wave: 5 });
  assert.equal(log.entries().length, 0);
  assert.equal(log.stats().emitted, 0);
});

test("a span records how long the thing took", () => {
  const clock = fixedClock();
  const log = createEventLog({ enabled: true, clock: clock.read });

  const done = log.span("source", "ask", { source: "Source 03" });
  clock.advance(2_412);
  done({ outcome: "offer" });

  const [start, end] = log.entries();
  assert.equal(start.event, "ask.start");
  assert.equal(end.event, "ask.end");
  assert.equal(end.data.ms, 2412);
  assert.equal(end.data.outcome, "offer");
});

test("closing a span twice records once", () => {
  const log = createEventLog({ enabled: true, clock: fixedClock().read });
  const done = log.span("source", "ask");
  done();
  done();
  assert.equal(log.entries().length, 2);
});

test("times are relative to when the log started, not to the epoch", () => {
  const clock = fixedClock();
  const log = createEventLog({ enabled: true, clock: clock.read });
  clock.advance(750);
  log.event("router", "start");
  assert.equal(log.entries()[0].t, 750);
});

test("the buffer keeps the newest entries and counts what fell off", () => {
  const log = createEventLog({ enabled: true, limit: 3, clock: fixedClock().read });
  for (let index = 0; index < 5; index += 1) {
    log.event("router", "step", { index });
  }

  const kept = log.entries();
  assert.deepEqual(
    kept.map((entry) => entry.data.index),
    [2, 3, 4],
  );
  assert.deepEqual(log.stats(), { kept: 3, dropped: 2, limit: 3, emitted: 5 });
});

test("an unknown channel is filed rather than lost", () => {
  const log = createEventLog({ enabled: true, clock: fixedClock().read });
  log.event("nonsense", "step");
  assert.ok(CHANNELS.includes(log.entries()[0].channel));
});

test("payloads are flattened to values that can be serialised", () => {
  const log = createEventLog({ enabled: true, clock: fixedClock().read });
  const cyclic = { name: "x" };
  cyclic.self = cyclic;

  log.event("attach", "element", {
    element: new (class Video {})(),
    handler: () => {},
    error: new Error("no manifest"),
    nested: cyclic,
    fine: 12.3456,
  });

  const { data } = log.entries()[0];
  assert.equal(data.element, "[Video]");
  assert.equal(data.handler, "[function]");
  assert.deepEqual(data.error, { name: "Error", message: "no manifest" });
  assert.equal(data.fine, 12.35);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test("infinities survive as something readable rather than as null", () => {
  const log = createEventLog({ enabled: true, clock: fixedClock().read });
  log.event("router", "step", { graceUntil: Number.POSITIVE_INFINITY });
  assert.equal(log.entries()[0].data.graceUntil, "Infinity");
});

test("the sink sees every entry, and a sink that throws is survivable", () => {
  const seen = [];
  const log = createEventLog({
    enabled: true,
    clock: fixedClock().read,
    sink: (entry) => {
      seen.push(entry.event);
      throw new Error("console is gone");
    },
  });

  assert.doesNotThrow(() => log.event("router", "start"));
  assert.deepEqual(seen, ["start"]);
  assert.equal(log.entries().length, 1);
});

test("a summary ranks the slowest spans first", () => {
  const clock = fixedClock();
  const log = createEventLog({ enabled: true, clock: clock.read });

  const slow = log.span("source", "ask", { source: "Source 01" });
  clock.advance(4_800);
  slow();
  const quick = log.span("source", "ask", { source: "Source 02" });
  clock.advance(320);
  quick();

  const summary = summarize(log.entries());
  assert.equal(summary.channels.source, 4);
  assert.equal(summary.slowest[0].ms, 4800);
  assert.equal(summary.slowest[1].ms, 320);
  assert.equal(summary.spanMs, 5120);
});

test("one entry is one readable line", () => {
  const log = createEventLog({ enabled: true, clock: fixedClock().read });
  log.event("source", "http", { source: "Source 07", status: 200, ms: 812 });
  const line = formatEntry(log.entries()[0]);
  assert.match(line, /source\/http/);
  assert.match(line, /status=200/);
  assert.match(line, /source="Source 07"/);
});

test("debug payloads redact credentials and URL query strings", () => {
  const value = sanitizeDebugValue({
    token: "secret-value",
    target: "https://media.example/pl/master.m3u8?token=secret-value",
    message:
      "failed at https://media.example/pl/master.m3u8?token=secret-value",
  });
  assert.equal(value.token, "[redacted]");
  assert.equal(value.target, "[redacted]");
  assert.equal(value.message, "failed at https://media.example/pl/master.m3u8");
});

test("DEBUG=1 is an exact development-only server trace flag", () => {
  assert.equal(serverDebugEnabled({ NODE_ENV: "development", DEBUG: "1" }), true);
  assert.equal(serverDebugEnabled({ NODE_ENV: "development", DEBUG: "0" }), false);
  assert.equal(serverDebugEnabled({ NODE_ENV: "production", DEBUG: "1" }), false);
  assert.equal(normalizeTraceId("playback:abc-123"), "playback:abc-123");
  assert.equal(normalizeTraceId("../../bad"), null);
});
