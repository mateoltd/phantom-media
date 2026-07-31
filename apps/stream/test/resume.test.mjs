import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
const browser = new EventTarget();
browser.localStorage = {
  getItem(key) {
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, value);
  },
};
globalThis.window = browser;

const {
  readResumePoint,
  resumableTime,
  saveResumePoint,
  subscribeProgress,
  watchedPercent,
} = await import("../lib/resume.ts");

test.beforeEach(() => {
  values.clear();
});

test("completed playback remains stored but is not resumed", () => {
  saveResumePoint("episode", 950, 1_000);

  const point = readResumePoint("episode");
  assert.equal(point?.completed, true);
  assert.equal(point?.time, 1_000);
  assert.equal(watchedPercent(point), 100);
  assert.equal(resumableTime(point), null);
});

test("starting a rewatch does not erase completed status", () => {
  saveResumePoint("episode", 950, 1_000);
  saveResumePoint("episode", 10, 1_000);

  const point = readResumePoint("episode");
  assert.equal(point?.completed, true);
  assert.equal(watchedPercent(point), 100);
});

test("a completed episode can still resume a later rewatch", () => {
  saveResumePoint("episode", 950, 1_000);
  saveResumePoint("episode", 240, 1_000);

  const point = readResumePoint("episode");
  assert.equal(point?.completed, true);
  assert.equal(point?.time, 240);
  assert.equal(watchedPercent(point), 100);
  assert.equal(resumableTime(point), 240);
});

test("same-page progress writes notify mounted episode lists", () => {
  let updates = 0;
  const unsubscribe = subscribeProgress(() => {
    updates += 1;
  });

  saveResumePoint("episode", 240, 1_000);
  assert.equal(updates, 1);

  unsubscribe();
  saveResumePoint("episode", 300, 1_000);
  assert.equal(updates, 1);
});
