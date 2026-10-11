import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import Hls from "hls.js";

const source = readFileSync(new URL("../components/player/use-hls.ts", import.meta.url), "utf8");
// Exercise the hook's actual registered callbacks without a DOM or duplicating
// its recovery policy. A registration change must update this harness explicitly.
const registrations = ["ERROR", "FRAG_LOADED", "FRAG_BUFFERED"].map(event => {
  const registration = source.match(new RegExp(`    hls\\.on\\(Hls\\.Events\\.${event}, [\\s\\S]*?\\n    \\}\\);`));
  assert.ok(registration, `missing ${event} registration`);
  return registration[0];
}).join("\n");

function fixture() {
  const callbacks = new Map();
  const hls = {
    on: (event, callback) => callbacks.set(event, callback),
    loadSource: mock.fn(), startLoad: mock.fn(), recoverMediaError: mock.fn(), destroy: mock.fn(),
  };
  const create = new Function("Hls", "hls", `
    let prefetchEnabled = true, prefetchFailures = 0, levelsSynced = true, recoveries = 0;
    const src = '/api/live/master.m3u8?channel=example';
    const capturePlayback = () => {};
    const liveController = { reset() {}, stall() {} };
    const connection = { networkError() {}, fragmentLoaded() {} };
    const publishConnection = () => {};
    const CONNECTION_ERROR_DETAILS = new Set();
    const setError = () => {}, setLoading = () => {}, reportError = () => {};
    const hlsRef = { current: hls };
    ${registrations}
    return () => ({ prefetchEnabled, prefetchFailures, recoveries });
  `);
  const state = create(Hls, hls);
  const frag = {
    type: "main", sn: 1, duration: 2, tagList: [["EXT-X-STILL-PREFETCH", "1"]],
    stats: { aborted: false, loaded: 1_000_000, loading: { start: 0, first: 100, end: 2_100 } },
  };
  return {
    hls, frag, state,
    emit(event, data) { callbacks.get(event)(event, data); },
    downloaded(fragment = frag) { callbacks.get(Hls.Events.FRAG_LOADED)(Hls.Events.FRAG_LOADED, { frag: fragment }); },
    buffered(fragment = frag) { callbacks.get(Hls.Events.FRAG_BUFFERED)(Hls.Events.FRAG_BUFFERED, { frag: fragment, stats: fragment.stats }); },
    failed(fragment = frag, fatal = false) {
      callbacks.get(Hls.Events.ERROR)(Hls.Events.ERROR, {
        type: Hls.ErrorTypes.MEDIA_ERROR, details: Hls.ErrorDetails.FRAG_PARSING_ERROR,
        fatal, frag: fragment,
      });
    },
  };
}

test("successful downloads followed by repeated parsing failures retreat to completed segments once", () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) { f.downloaded(); f.failed(); }
  assert.equal(f.state().prefetchEnabled, false);
  assert.equal(f.hls.loadSource.mock.callCount(), 1);
  assert.equal(f.hls.loadSource.mock.calls[0].arguments[0], "/api/live/master.m3u8?channel=example");
});

test("confirmed playable buffering breaks a predictive failure sequence", () => {
  const f = fixture();
  f.failed();
  assert.equal(f.state().prefetchFailures, 1);
  f.downloaded();
  assert.equal(f.state().prefetchFailures, 1, "download success alone is insufficient");
  f.buffered();
  assert.equal(f.state().prefetchFailures, 0);
  f.failed();
  assert.equal(f.state().prefetchEnabled, true);
  assert.equal(f.hls.loadSource.mock.callCount(), 0);
  f.failed();
  assert.equal(f.hls.loadSource.mock.callCount(), 1);
});

test("aborted, init, unrelated and completed-segment buffering cannot erase predictive failures", () => {
  for (const patch of [
    { stats: { aborted: true } },
    { sn: "initSegment" },
    { type: "subtitle" },
    { tagList: [] },
  ]) {
    const f = fixture();
    f.failed();
    f.buffered({ ...f.frag, ...patch });
    assert.equal(f.state().prefetchFailures, 1);
    f.failed();
    assert.equal(f.hls.loadSource.mock.callCount(), 1);
  }
});

test("a fatal predictive error falls back immediately while ordinary parsing errors do not opt out", () => {
  const f = fixture();
  f.failed({ ...f.frag, tagList: [] });
  assert.equal(f.state().prefetchFailures, 0);
  f.failed(f.frag, true);
  assert.equal(f.hls.loadSource.mock.callCount(), 1);
  assert.equal(f.hls.recoverMediaError.mock.callCount(), 0, "fallback precedes generic fatal recovery");
});
