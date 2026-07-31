import assert from "node:assert/strict";
import test from "node:test";
import { scheduleSourceAutostart } from "../src/source-autostart.mjs";

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
