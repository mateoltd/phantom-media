import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPlaybackSnapshot,
  capturePlaybackSnapshot,
} from "../src/playback-handoff.mjs";

test("snapshot captures exact playhead, paused, and renditions", () => {
  const video = { currentTime: 123.456, paused: true };
  const controller = {
    quality: () => ({ selected: 2, effective: 2 }),
    audio: () => ({ tracks: [], selected: 1 }),
  };
  const snapshot = capturePlaybackSnapshot(video, controller, 3);
  assert.deepEqual(snapshot, {
    currentTime: 123.456,
    paused: true,
    selectedLevel: 2,
    selectedAudio: 1,
    selectedSubtitle: 3,
  });
});

test("snapshot tolerates missing controller state", () => {
  const snapshot = capturePlaybackSnapshot({ currentTime: 10, paused: false }, null);
  assert.deepEqual(snapshot, {
    currentTime: 10,
    paused: false,
    selectedLevel: -1,
    selectedAudio: -1,
    selectedSubtitle: null,
  });
  assert.equal(capturePlaybackSnapshot(null, null), null);
  assert.equal(capturePlaybackSnapshot({ currentTime: NaN, paused: false }, null), null);
});

test("handoff restores exact time and renditions, never throwing", () => {
  const calls = [];
  const video = { currentTime: 0 };
  const controller = {
    setLevel: (index) => calls.push(["level", index]),
    setAudioTrack: (index) => calls.push(["audio", index]),
  };
  const snapshot = {
    currentTime: 321.75,
    paused: true,
    selectedLevel: 4,
    selectedAudio: 2,
    selectedSubtitle: null,
  };
  const returned = applyPlaybackSnapshot(video, controller, snapshot);
  assert.equal(returned, snapshot);
  assert.ok(calls.some(([k, v]) => k === "level" && v === 4));
  assert.ok(calls.some(([k, v]) => k === "audio" && v === 2));
  assert.equal(video.currentTime, 321.75);
});

test("handoff survives missing renditions on the new manifest", () => {
  const video = { currentTime: 5 };
  const controller = {
    setLevel: () => {
      throw new Error("no such level");
    },
    setAudioTrack: () => {
      throw new Error("no such track");
    },
  };
  const snapshot = { currentTime: 77.5, paused: false, selectedLevel: 9, selectedAudio: 9 };
  assert.doesNotThrow(() => applyPlaybackSnapshot(video, controller, snapshot));
  assert.equal(video.currentTime, 77.5);
  assert.equal(applyPlaybackSnapshot(video, controller, null), null);
});
