import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";
import { FetchLoader } from "hls.js";
import Hls from "hls.js";
import { createLiveFragmentLoader } from "../lib/media/live-loader.ts";

const originalSelf = globalThis.self;
globalThis.self = globalThis;
after(() => {
  if (originalSelf === undefined) delete globalThis.self;
  else globalThis.self = originalSelf;
});
afterEach(() => mock.restoreAll());
function fixture({ predictive = true, mp4 = true, live = true } = {}) {
  const details = { live, PTSKnown: true };
  const hls = { levels: [{ details }] };
  const Loader = createLiveFragmentLoader(hls);
  const loader = new Loader(Hls.DefaultConfig);
  const context = { frag: { level: 0, initSegment: mp4 ? {} : null, tagList: predictive ? [["EXT-X-STILL-PREFETCH", "1"]] : [] } };
  let passed;
  mock.method(FetchLoader.prototype, "load", (c, config, callbacks) => { passed = { c, config, callbacks }; });
  return { details, loader, context, hls, passed: () => passed };
}

test("fMP4 progressive chunks retain the first chunk's timestamp origin and restore playlist state", () => {
  const f = fixture();
  const flags = [];
  f.loader.load(f.context, { highWaterMark: 128 * 1024 }, { onProgress: () => flags.push(f.details.PTSKnown) });
  const p = f.passed();
  assert.equal(p.config.highWaterMark, 32 * 1024);
  for (let i = 0; i < 3; i++) {
    p.callbacks.onProgress({}, f.context, new ArrayBuffer(32 * 1024), null);
    assert.equal(f.details.PTSKnown, true);
  }
  assert.deepEqual(flags, [true, false, false]);
});

test("TS and non-live playback keep normal timestamp checks", () => {
  for (const options of [{ mp4: false }, { live: false }]) {
    const f = fixture(options), flags = [];
    f.loader.load(f.context, { highWaterMark: 128 * 1024 }, { onProgress: () => flags.push(f.details.PTSKnown) });
    for (let i = 0; i < 3; i++) f.passed().callbacks.onProgress({}, f.context, new ArrayBuffer(8), null);
    assert.deepEqual(flags, [true, true, true]);
  }
});

test("completed live fMP4 protects timestamps too, including startup and quality switches", () => {
  const f = fixture({ predictive: false }), flags = [];
  f.loader.load(f.context, { highWaterMark: 128 * 1024 }, { onProgress: () => flags.push(f.details.PTSKnown) });
  for (let i = 0; i < 3; i++) f.passed().callbacks.onProgress({}, f.context, new ArrayBuffer(8), null);
  assert.deepEqual(flags, [true, false, false]);
});

test("a callback failure restores PTSKnown and progressive counters belong to each request", () => {
  const f = fixture();
  let shouldThrow = false;
  f.loader.load(f.context, {}, { onProgress: () => { if (shouldThrow) throw new Error("parse failure"); } });
  const p = f.passed();
  assert.equal(p.config.highWaterMark, undefined, "non-progressive delivery remains non-progressive");
  p.callbacks.onProgress({}, f.context, new ArrayBuffer(8), null);
  shouldThrow = true;
  assert.throws(() => p.callbacks.onProgress({}, f.context, new ArrayBuffer(8), null), /parse failure/);
  assert.equal(f.details.PTSKnown, true);
  const flags = [];
  f.loader.load(f.context, {}, { onProgress: () => flags.push(f.details.PTSKnown) });
  f.passed().callbacks.onProgress({}, f.context, new ArrayBuffer(8), null);
  assert.deepEqual(flags, [true]);
});
