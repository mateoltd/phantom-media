import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";
import Hls from "hls.js";
import { LiveAbrController } from "../lib/media/live-abr.ts";

const originalSelf = globalThis.self;
globalThis.self = globalThis;
after(() => {
  if (originalSelf === undefined) delete globalThis.self;
  else globalThis.self = originalSelf;
});
afterEach(() => mock.restoreAll());

function fixture(t) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  mock.method(performance, "now", () => now);
  mock.method(globalThis, "setInterval", (callback, interval) => {
    const id = nextId++;
    timers.set(id, { callback, interval });
    return id;
  });
  mock.method(globalThis, "clearInterval", id => timers.delete(id));
  const noop = () => {};
  const hls = {
    config: { ...Hls.DefaultConfig, abrEwmaDefaultEstimate: 10_000_000, useMediaCapabilities: false },
    logger: { debug: noop, log: noop, warn: noop, info: noop, error: noop },
    on: noop, off: noop, trigger: mock.fn(),
    autoLevelEnabled: false, minAutoLevel: 0, loadLevel: 2, firstLevel: 2, allAudioTracks: [],
    media: { paused: false, playbackRate: 1, readyState: 4 },
    mainForwardBufferInfo: { len: 0.2 },
    levels: [200_000, 1_000_000, 4_000_000].map(bitrate => ({
      bitrate, averageBitrate: bitrate, maxBitrate: bitrate, details: { live: true }, loadError: 0, fragmentError: 0,
    })),
    latestLevelDetails: { live: true },
  };
  const abr = new LiveAbrController(hls);
  abr.bwEstimator.sample(800, 1_000_000); // A real 10 Mbps baseline sample.
  t.after(() => abr.destroy());
  const data = ({ predictive = true, first = 100, end = 2_100, loaded = 1_000_000, aborted = false } = {}) => {
    const stats = {
      aborted, loaded, total: loaded, loading: { start: 0, first, end },
      parsing: { end }, buffering: { end }, bwEstimate: 0,
    };
    return { frag: {
      type: "main", sn: 1, level: 2, duration: 2, bitrate: 4_000_000,
      tagList: predictive ? [["EXT-X-STILL-PREFETCH", "1"]] : [], stats,
      abortRequests: mock.fn(),
    }, stats, id: "main" };
  };
  return {
    abr, hls, timers, data,
    tick(ms = 250) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timers.has(id)) timer.callback();
    },
  };
}

test("real encoder-paced buffering preserves the bandwidth estimate; completed segments still sample", t => {
  const f = fixture(t);
  const before = f.abr.bwEstimator.getEstimate();
  const paced = f.data();
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, paced);
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, paced);
  assert.equal(f.abr.bwEstimator.getEstimate(), before);
  const completed = f.data({ predictive: false });
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, completed);
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, completed);
  assert.ok(f.abr.bwEstimator.getEstimate() < before);
});

test("a five-second predictive download updates the real EWMA instead of retaining a stale 10 Mbps estimate", t => {
  const f = fixture(t);
  const slow = f.data({ end: 5_000 });
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, slow);
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, slow);
  assert.ok(f.abr.bwEstimator.getEstimate() < 5_000_000);
  assert.equal(slow.stats.bwEstimate, f.abr.bwEstimator.getEstimate());
  const before = f.abr.bwEstimator.getEstimate();
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, f.data({ end: 5_000, aborted: true }));
  assert.equal(f.abr.bwEstimator.getEstimate(), before, "aborted data is not a bandwidth sample");
});

test("slow in-flight predictive payload restores native emergency downswitching", t => {
  const f = fixture(t);
  f.hls.autoLevelEnabled = true;
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, f.data());
  const slow = f.data({ end: 0, loaded: 500_000 });
  slow.stats.total = 1_000_000;
  f.abr.onFragLoading(Hls.Events.FRAG_LOADING, slow);
  assert.deepEqual([...f.timers.values()].map(timer => timer.interval), [250]);
  f.tick(); // First actual payload observation.
  f.tick(2_500);
  assert.equal(f.hls.nextAutoLevel, undefined, "normal encoding time cannot force a downgrade");
  f.tick();
  assert.deepEqual([...f.timers.values()].map(timer => timer.interval), [100]);
  f.tick(100); // Execute the installed hls.js emergency rules.
  assert.equal(f.hls.nextAutoLevel, 0);
  assert.equal(f.hls.nextLoadLevel, 0);
  assert.equal(f.hls.trigger.mock.calls[0].arguments[0], Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED);
});

test("headers and future-segment waits do not count as slow payload delivery", t => {
  const f = fixture(t);
  const future = f.data({ end: 0, loaded: 0 });
  future.stats.total = 0;
  f.abr.onFragLoading(Hls.Events.FRAG_LOADING, future);
  f.tick(5_000); // Headers have arrived, but no media exists yet.
  assert.deepEqual([...f.timers.values()].map(timer => timer.interval), [250]);
  future.stats.loaded = 250_000;
  f.tick(); // Production starts now.
  f.tick(2_000);
  future.stats.loaded = future.stats.total = 1_000_000;
  future.stats.loading.end = future.stats.parsing.end = performance.now();
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, future);
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, future);
  assert.equal(f.abr.bwEstimator.getEstimate(), 10_000_000);
  assert.equal(f.timers.size, 0);
});

test("a late fast burst between monitor ticks cannot turn encoder wait into low bandwidth", t => {
  const f = fixture(t);
  const burst = f.data({ end: 0, loaded: 0 });
  burst.stats.total = 0;
  f.abr.onFragLoading(Hls.Events.FRAG_LOADING, burst);
  f.tick(5_000);
  burst.stats.loaded = burst.stats.total = 1_000_000;
  burst.stats.loading.end = burst.stats.parsing.end = performance.now();
  f.abr.onFragLoaded(Hls.Events.FRAG_LOADED, burst);
  f.abr.onFragBuffered(Hls.Events.FRAG_BUFFERED, burst);
  assert.equal(f.abr.bwEstimator.getEstimate(), 10_000_000);
  assert.equal(f.timers.size, 0);
});

test("completed, aborted, replaced, switched and destroyed loads clean up predictive monitoring", t => {
  const f = fixture(t);
  const loading = () => {
    const data = f.data({ end: 0, loaded: 100_000 });
    data.stats.total = 0;
    f.abr.onFragLoading(Hls.Events.FRAG_LOADING, data);
    return data;
  };
  const aborted = loading();
  aborted.stats.aborted = true;
  f.tick();
  assert.equal(f.timers.size, 0);
  loading(); loading();
  assert.equal(f.timers.size, 1, "replacement owns a single monitor");
  f.abr.onLevelSwitching(Hls.Events.LEVEL_SWITCHING, {});
  assert.equal(f.timers.size, 0);
  loading();
  f.abr.onManifestLoading(Hls.Events.MANIFEST_LOADING, {});
  assert.equal(f.timers.size, 0);
  loading();
  f.abr.destroy();
  assert.equal(f.timers.size, 0);
});

test("retrying the same fragment starts a fresh payload allowance", t => {
  const f = fixture(t);
  const retry = f.data({ end: 0, loaded: 100_000 });
  retry.stats.total = 0;
  f.abr.onFragLoading(Hls.Events.FRAG_LOADING, retry);
  f.tick();
  retry.stats.aborted = true;
  f.tick(5_000);
  retry.stats.aborted = false;
  retry.stats.loaded = 0;
  f.abr.onFragLoading(Hls.Events.FRAG_LOADING, retry);
  f.tick(5_000);
  retry.stats.loaded = 100_000;
  f.tick();
  f.tick(2_000);
  assert.deepEqual([...f.timers.values()].map(timer => timer.interval), [250]);
});
