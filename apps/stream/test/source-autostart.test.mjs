import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduleSourceAutostart,
  scheduleSourceAutostartOnce,
} from "../src/source-autostart.mjs";

function fakeTimers() {
  let scheduled;
  let cleared = null;
  return {
    timers: {
      setTimeout(callback) {
        scheduled = callback;
        return 17;
      },
      clearTimeout(timer) {
        cleared = timer;
      },
    },
    run: () => scheduled?.(),
    cleared: () => cleared,
  };
}

test("Strict Mode cleanup prevents the discarded mount from starting a race", () => {
  const fake = fakeTimers();
  let starts = 0;
  const cancel = scheduleSourceAutostart(() => {
    starts += 1;
  }, fake.timers);
  cancel();
  fake.run();
  assert.equal(starts, 0);
  assert.equal(fake.cleared(), 17);
});

test("the surviving mount starts exactly once", () => {
  const fake = fakeTimers();
  let starts = 0;
  scheduleSourceAutostart(() => {
    starts += 1;
  }, fake.timers);
  fake.run();
  assert.equal(starts, 1);
});

test("Strict Mode's surviving setup starts after the discarded setup", () => {
  const fake = fakeTimers();
  const started = { current: "" };
  let starts = 0;
  const start = () => {
    starts += 1;
  };

  const discard = scheduleSourceAutostartOnce(
    started,
    "episode-1",
    start,
    fake.timers,
  );
  discard();
  scheduleSourceAutostartOnce(started, "episode-1", start, fake.timers);
  fake.run();
  fake.run();

  assert.equal(starts, 1);
  assert.equal(started.current, "episode-1");
});
