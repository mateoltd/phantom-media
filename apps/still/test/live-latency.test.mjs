import assert from "node:assert/strict";
import test from "node:test";
import { bufferAhead, createLiveLatencyController, minimumLiveLatency } from "../lib/media/live-latency.ts";

const ranges = (...values) => ({ length: values.length, start: i => values[i][0], end: i => values[i][1] });
const timeline = { live: true, targetDuration: 2, segmentDuration: 2, partTarget: 0, partHoldBack: 0, age: 0, edge: 100 };

function fixture({ native = false, currentTime = 70, refreshTimeline } = {}) {
  let now = 0;
  let details = native ? null : { ...timeline };
  const seeks = [];
  const targets = [];
  const video = Object.assign(new EventTarget(), {
    currentTime, playbackRate: 1, paused: false, seeking: false, ended: false,
    readyState: 4, seekable: ranges([40, 100]), buffered: ranges([40, 100]), played: ranges([40, 70]),
  });
  const controller = createLiveLatencyController(video, {
    native, now: () => now, timeline: () => details, refreshTimeline,
    setTargetLatency: seconds => {
      targets.push(seconds);
    },
    onSeek: time => seeks.push(time),
  });
  return {
    video, controller, seeks, targets,
    advance(ms = 1_000) { now += ms; },
    details(value) { details = value; },
    event(name) { video.dispatchEvent(new Event(name)); },
    tick(active = true, unstable = false) { controller.tick(active, unstable); },
  };
}

test("ordinary HLS targets a small segment-aware margin; LL-HLS honours part hold-back", () => {
  assert.equal(minimumLiveLatency(timeline), 3);
  assert.equal(minimumLiveLatency({ ...timeline, targetDuration: 6 }), 3, "a conservative upper bound does not add latency");
  assert.equal(minimumLiveLatency({ ...timeline, targetDuration: 6, segmentDuration: 6 }), 9);
  assert.equal(minimumLiveLatency({ ...timeline, segmentDuration: 0.5 }), 2);
  assert.equal(minimumLiveLatency({ ...timeline, partTarget: 0.5, partHoldBack: 2 }), 2);
  assert.equal(minimumLiveLatency({ ...timeline, partTarget: 0.5, partHoldBack: 0 }), 1.5);
});

test("resume jumps out of the paused buffer to the safe live position", () => {
  const f = fixture();
  f.video.paused = true;
  f.event("pause");
  f.advance(35_000);
  f.tick(false);
  assert.equal(f.video.currentTime, 70, "pausing never moves the playhead");
  assert.equal(f.controller.behindLive, true);
  f.video.paused = false;
  f.event("play");
  assert.equal(f.video.currentTime, 97);
  assert.deepEqual(f.seeks, [97]);
  assert.equal(f.video.playbackRate, 1);
  assert.equal(f.controller.behindLive, false);
});

test("resume can load an unbuffered edge without reusing the paused position", () => {
  const f = fixture();
  f.video.buffered = ranges([40, 75]);
  f.event("play");
  assert.equal(f.video.currentTime, 97);
  assert.equal(f.video.playbackRate, 1);
});

test("resume before metadata waits for a valid window and completes once", () => {
  const f = fixture();
  f.video.seekable = ranges();
  f.details(null);
  f.event("play");
  assert.equal(f.video.currentTime, 70);
  f.details({ ...timeline });
  f.controller.refresh();
  assert.equal(f.seeks.length, 0);
  f.video.seekable = ranges([40, 100]);
  f.controller.refresh();
  f.controller.refresh();
  assert.deepEqual(f.seeks, [97]);
});

test("a stale playlist defers resume until the current edge arrives", () => {
  const f = fixture();
  f.details({ ...timeline, age: 20 });
  f.event("play");
  assert.equal(f.video.currentTime, 70);
  f.controller.refresh();
  assert.equal(f.seeks.length, 0);
  f.details({ ...timeline, age: 0 });
  f.controller.refresh();
  assert.equal(f.video.currentTime, 97);
});

test("a slow paused reload jumps immediately into the live window, then refreshes once", () => {
  let reloads = 0;
  const f = fixture({ refreshTimeline: () => reloads++ });
  f.details({ ...timeline, age: 3 });
  f.event("play");
  f.tick(); f.advance(); f.tick();
  assert.equal(reloads, 1);
  assert.equal(f.video.currentTime, 98);
  f.details({ ...timeline, age: 0, edge: 104 });
  f.video.seekable = ranges([40, 104]);
  f.controller.refresh();
  assert.equal(f.video.currentTime, 101);
});

test("pause cancels deferred autoplay positioning, while an explicit paused jump still seeks", () => {
  const f = fixture();
  f.video.seekable = ranges();
  f.event("play");
  f.video.paused = true;
  f.event("pause");
  f.video.seekable = ranges([40, 100]);
  f.controller.refresh();
  assert.equal(f.video.currentTime, 70);
  f.controller.goLive();
  assert.equal(f.video.currentTime, 97);
  assert.equal(f.video.paused, true);
});

test("native HLS resumes in the latest seekable range with safety headroom", () => {
  const f = fixture({ native: true });
  f.video.seekable = ranges([0, 20], [80, 100]);
  f.event("play");
  assert.equal(f.video.currentTime, 97);
  f.video.seekable = ranges([99, 100]);
  f.controller.goLive();
  assert.equal(f.video.currentTime, 99);
});

test("small drift gently catches up with hysteresis, then restores normal speed", () => {
  const f = fixture();
  f.video.currentTime = 95;
  f.tick();
  assert.equal(f.video.playbackRate, 1.05);
  f.video.currentTime = 96.4;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 1.05, "keep catching up below the entry threshold");
  f.video.currentTime = 96.8;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 1);
  assert.equal(f.seeks.length, 0);
});

test("predictive catch-up follows actual bytes and protects a burst reserve", () => {
  const f = fixture();
  f.details({ ...timeline, edge: 104, prefetch: true, prefetchDuration: 4 });
  f.video.currentTime = 95;
  f.video.buffered = ranges([90, 96.5]);
  f.tick();
  assert.equal(f.video.playbackRate, 1.03);
  f.video.currentTime = 95.8;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 0.97, "build a reserve instead of consuming the last buffered bytes");
  f.video.currentTime = 96;
  f.video.buffered = ranges([90, 97.4]);
  f.controller.stall();
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 0.97, "a rebuffer builds extra headroom on progressive delivery");
  f.advance(); f.tick(true, true);
  assert.equal(f.video.playbackRate, 1, "unstable playback does not adjust speed");
});

test("predictive resume retains a playable reserve before future advertised segments", () => {
  for (const duration of [2, 4]) {
    const f = fixture();
    f.details({ ...timeline, edge: 100 + duration, prefetch: true, prefetchDuration: duration });
    f.video.seekable = ranges([40, 100 + duration]);
    f.event("play");
    assert.equal(f.video.currentTime, 99.25);
    assert.equal(f.video.playbackRate, 1);
    f.advance(4_000);
    f.controller.stall();
    f.controller.goLive();
    assert.equal(f.video.currentTime, 98.25, "stall headroom also changes the resume destination");
  }
});

test("resume and large drift use already encoded prefetch with headroom and no redundant reload", () => {
  let reloads = 0;
  const f = fixture({ refreshTimeline: () => reloads++ });
  f.details({ ...timeline, edge: 104, prefetch: true, prefetchDuration: 4 });
  f.video.seekable = ranges([40, 104]);
  f.video.buffered = ranges([40, 102]);
  f.event("play");
  assert.equal(f.video.currentTime, 101.25);
  assert.equal(reloads, 0, "the encoded landing point already retains a playable reserve");
  f.advance(4_000);
  f.video.currentTime = 80;
  f.tick();
  assert.equal(f.video.currentTime, 101.25, "large delays recover in one buffered jump");
  assert.equal(f.video.playbackRate, 1);

  f.video.seekable = ranges([40, 95], [103, 104]);
  f.video.buffered = ranges([40, 102]);
  f.controller.goLive();
  assert.equal(f.video.currentTime, 103, "a buffer outside the latest seekable window is not a live landing point");
});

test("progressive bytes beyond the completed-segment edge recover delay without reducing the reserve", () => {
  const f = fixture({ currentTime: 100 });
  f.details({ ...timeline, edge: 104, prefetch: true, prefetchDuration: 4 });
  f.video.seekable = ranges([40, 104]);
  f.video.currentTime = 100.5;
  f.video.buffered = ranges([90, 101.6]);
  f.tick();
  assert.equal(f.video.playbackRate, 1.03, "playable bytes can lead the conservative resume point");
  assert.equal(f.seeks.length, 0);
  f.video.currentTime = 100.8;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 1, "stop catch-up before the 750ms reserve is consumed");
  f.video.currentTime = 101;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 0.97, "rebuild the unchanged reserve after jitter");
  f.video.buffered = ranges([90, 101.6], [103, 110]);
  f.video.currentTime = 101.1;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 0.97, "a later disconnected range cannot justify catch-up");
});

test("large 10–35 second drift uses an already-buffered landing point", () => {
  for (const drift of [10, 20, 35]) {
    const f = fixture({ currentTime: 96 - drift });
    f.video.currentTime = 97 - drift;
    f.tick();
    assert.equal(f.video.currentTime, 97);
    assert.equal(f.video.playbackRate, 1);
    assert.equal(f.seeks.length, 1);
    f.video.currentTime += 0.5;
    f.advance(); f.tick();
    assert.equal(f.seeks.length, 1, "do not repeatedly jump");
  }
});

test("only sustained healthy progressive delivery earns a smaller reserve; stalls and seeks restore safety", () => {
  const f = fixture({ currentTime: 100 });
  f.details({ ...timeline, edge: 104, prefetch: true, prefetchDuration: 4 });
  f.video.seekable = ranges([40, 104]);
  const step = (ahead, active = true, unstable = false) => {
    f.video.currentTime += 0.01;
    f.video.buffered = ranges([90, f.video.currentTime + ahead]);
    f.tick(active, unstable);
  };
  step(0.65);
  assert.equal(f.video.playbackRate, 0.97, "startup retains 750ms");
  for (let i = 0; i < 29; i++) { f.advance(); step(0.65); }
  assert.equal(f.video.playbackRate, 0.97);
  f.advance(); step(0.65);
  assert.equal(f.video.playbackRate, 1, "30 healthy seconds permit a 600ms reserve");
  f.controller.reset();
  f.advance(4_000); step(0.65);
  assert.equal(f.video.playbackRate, 0.97, "seeks restore the conservative reserve");
  for (let i = 0; i < 30; i++) { f.advance(); step(0.65); }
  assert.equal(f.video.playbackRate, 1);
  f.controller.stall();
  f.advance(); step(0.9);
  assert.equal(f.video.playbackRate, 0.97, "real stalls restore the base and add extra headroom");
  assert.equal(f.controller.targetLatency, 4);
});

test("an interrupted delivery probe cannot count hidden, unstable, or starved time as healthy", () => {
  for (const interrupted of ["hidden", "unstable", "starved", "lowBuffer"]) {
    const f = fixture({ currentTime: 100 });
    f.details({ ...timeline, edge: 104, prefetch: true, prefetchDuration: 4 });
    f.video.seekable = ranges([40, 104]);
    const step = () => {
      f.video.currentTime += 0.01;
      f.video.buffered = ranges([90, f.video.currentTime + 0.65]);
      f.tick();
    };
    step();
    for (let i = 0; i < 29; i++) { f.advance(); step(); }
    f.advance();
    if (interrupted === "starved") f.video.readyState = 2;
    if (interrupted === "lowBuffer") f.video.buffered = ranges([90, f.video.currentTime + 0.4]);
    f.tick(interrupted !== "hidden", interrupted === "unstable");
    f.video.readyState = 4;
    for (let i = 0; i < 29; i++) { f.advance(); step(); }
    assert.equal(f.video.playbackRate, 0.97, interrupted);
  }
});

test("buffer gaps and starvation cannot cause a catch-up seek or speed-up", () => {
  const f = fixture();
  f.video.currentTime = 71;
  f.video.buffered = ranges([40, 72], [90, 100]);
  assert.equal(bufferAhead(f.video.buffered, 75), 0);
  f.tick();
  assert.equal(f.video.currentTime, 71);
  assert.equal(f.video.playbackRate, 1);
  f.video.currentTime = 72;
  f.video.buffered = ranges([40, 80]);
  f.advance(); f.tick();
  assert.equal(f.video.currentTime, 72, "never jump to an unbuffered destination");
  assert.equal(f.video.playbackRate, 1.05, "buffered playback may recover drift gradually");
  f.video.readyState = 2;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 1);
});

test("unstable delivery, hidden playback, pause, seek and ended playback stop catch-up", () => {
  for (const state of ["unstable", "hidden", "paused", "seeking", "ended", "stale"]) {
    const f = fixture();
    f.video.currentTime = 95;
    f.tick();
    assert.equal(f.video.playbackRate, 1.05);
    if (["paused", "seeking", "ended"].includes(state)) f.video[state] = true;
    if (state === "stale") f.details({ ...timeline, age: 20 });
    f.video.currentTime += 0.1;
    f.advance(); f.tick(state !== "hidden", state === "unstable");
    assert.equal(f.video.playbackRate, 1, state);
    assert.equal(f.seeks.length, 0, state);
  }
});

test("stall notifications add bounded safety only once per episode and recover slowly", () => {
  const f = fixture();
  f.controller.stall();
  f.controller.stall();
  assert.equal(f.controller.targetLatency, 4);
  for (let i = 0; i < 10; i++) {
    f.advance(5_000);
    f.controller.stall();
  }
  assert.equal(f.controller.targetLatency, 7, "headroom is bounded");
  f.video.currentTime = 92;
  f.advance(); f.tick();
  for (let i = 0; i < 29; i++) {
    f.video.currentTime += 0.01;
    f.advance(); f.tick();
  }
  assert.equal(f.controller.targetLatency, 7);
  f.video.currentTime += 0.01;
  f.advance(); f.tick();
  assert.equal(f.controller.targetLatency, 6.5);
  f.video.paused = true;
  f.advance(60_000); f.tick(false);
  assert.equal(f.controller.targetLatency, 6.5, "paused wall-clock time is not healthy playback");
});

test("native starvation adapts safety; startup and intentional seeks do not count as stalls", () => {
  const f = fixture({ native: true });
  f.video.readyState = 2;
  f.tick(); f.advance(2_000); f.tick();
  assert.equal(f.controller.targetLatency, 4);
  f.video.seeking = true;
  f.advance(10_000); f.controller.stall();
  assert.equal(f.controller.targetLatency, 4);
  f.video.seeking = false;
  f.controller.reset();
  f.controller.stall();
  assert.equal(f.controller.targetLatency, 4);
  f.advance(5_000);
  f.video.played = ranges();
  f.controller.stall();
  assert.equal(f.controller.targetLatency, 4);
});

test("short real rebuffering adds safety but metadata/seek waits and tiny hiccups do not", () => {
  const f = fixture();
  f.tick();
  f.event("waiting"); f.advance(300); f.event("playing");
  assert.equal(f.controller.targetLatency, 4);
  f.advance(6_000);
  f.event("waiting"); f.advance(100); f.event("playing");
  assert.equal(f.controller.targetLatency, 4);
  f.controller.reset();
  f.event("waiting"); f.advance(300); f.event("playing");
  assert.equal(f.controller.targetLatency, 4);
});

test("quality switch resets catch-up; destruction removes events and cancels deferred resume", () => {
  const f = fixture();
  f.video.currentTime = 95;
  f.tick();
  f.controller.reset();
  assert.equal(f.video.playbackRate, 1);
  f.video.currentTime += 0.1;
  f.advance(); f.tick();
  assert.equal(f.video.playbackRate, 1, "quality changes get a settling grace period");
  f.video.seekable = ranges();
  f.event("play");
  f.controller.destroy();
  f.video.seekable = ranges([40, 100]);
  f.event("play"); f.controller.refresh(); f.tick(); f.controller.goLive();
  assert.equal(f.seeks.length, 0);
});

test("a finished broadcast cannot be accelerated or seeked by the live controller", () => {
  const f = fixture();
  f.details({ ...timeline, live: false });
  f.event("play"); f.tick();
  assert.equal(f.video.currentTime, 70);
  assert.equal(f.video.playbackRate, 1);
});
