import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createReplayChatSession } from "../lib/chat/replay-session.ts";

afterEach(() => mock.restoreAll());

const message = (id, offset) => ({ id, offset, user: "viewer", color: "", text: id });
const page = (messages, nextOffset) => Response.json({ messages, nextOffset });

function setup(time = 100) {
  let state;
  let resets = 0;
  const requests = [];
  const replies = [];
  mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ offset: Number(new URL(url, "https://example.com").searchParams.get("offset")), ...options });
    const reply = replies.shift();
    assert.ok(reply, "unexpected fetch");
    return typeof reply === "function" ? reply() : reply;
  });
  const session = createReplayChatSession({
    vodId: "123",
    getTime: () => time,
    onChange: (value) => { state = value; },
    onReset: () => { resets += 1; },
  });
  return {
    session, requests, replies,
    setTime: (value) => { time = value; },
    get state() { return state; },
    get resets() { return resets; },
  };
}

test("resync at the same playhead clears exhaustion and fetches a fresh buffer", async () => {
  const chat = setup();
  chat.replies.push(page([message("stale", 90)], null));
  await chat.session.resync();
  assert.equal(chat.state.status, "End of available replay");
  await chat.session.update();
  assert.equal(chat.requests.length, 1, "a paused final page must not be polled");

  chat.replies.push(page([message("fresh", 110)], 111));
  await chat.session.resync();
  assert.deepEqual(chat.requests.map((request) => request.offset), [85, 85]);
  assert.ok(chat.requests.every((request) => request.cache === "no-store"));
  assert.deepEqual(chat.state.messages.map((item) => item.id), ["fresh"]);
  assert.equal(chat.state.status, "Synced with video");
});

test("retry after a transient failure starts from the current video position", async () => {
  const chat = setup();
  chat.replies.push(() => { throw new TypeError("Network unavailable"); });
  await chat.session.resync();
  assert.equal(chat.state.status, "Replay stalled");
  assert.equal(chat.state.error, "Network unavailable");
  await chat.session.update();
  assert.equal(chat.requests.length, 1);

  chat.setTime(105);
  chat.replies.push(page([message("recovered", 120)], 121));
  await chat.session.resync();
  assert.equal(chat.requests.at(-1).offset, 90);
  assert.equal(chat.state.error, "");
  assert.equal(chat.state.status, "Synced with video");
});

test("resync clears a prefetched cursor after small playback changes in either direction", async () => {
  const chat = setup();
  chat.replies.push(page([message("future", 200)], 201));
  await chat.session.resync();
  for (const time of [100.5, 100, 105]) {
    chat.setTime(time);
    chat.replies.push(page([message(String(time), time + 20)], time + 21));
    await chat.session.resync();
    assert.equal(chat.requests.at(-1).offset, Math.floor(time) - 15);
    assert.deepEqual(chat.state.messages.map((item) => item.id), [String(time)]);
  }
});

test("resync aborts an in-flight request and ignores its late response", async () => {
  const chat = setup();
  let finishOld;
  chat.replies.push(() => new Promise((resolve) => { finishOld = resolve; }));
  const oldRequest = chat.session.resync();
  chat.setTime(101);
  let finishNew;
  chat.replies.push(() => new Promise((resolve) => { finishNew = resolve; }));
  const newRequest = chat.session.resync();
  assert.equal(chat.requests[0].signal.aborted, true);
  finishOld(page([message("old", 999)], null));
  await oldRequest;
  await chat.session.update();
  assert.equal(chat.requests.length, 2, "the abandoned request must not clear the replacement's busy flag");
  finishNew(page([message("new", 120)], 121));
  await newRequest;
  assert.deepEqual(chat.state.messages.map((item) => item.id), ["new"]);
  assert.equal(chat.state.status, "Synced with video");

  chat.setTime(105);
  chat.replies.push(page([message("next", 125)], 126));
  await chat.session.update();
  assert.equal(chat.requests.at(-1).offset, 121);
});

test("a lagging page does not report sync before pagination catches up", async () => {
  const chat = setup();
  chat.replies.push(page([message("behind", 80)], 86));
  await chat.session.resync();
  assert.equal(chat.state.status, "Replay behind video");
  chat.replies.push(page([message("near", 95)], 96));
  await chat.session.update();
  assert.equal(chat.state.status, "Catching up…");
  let finish;
  chat.replies.push(() => new Promise((resolve) => { finish = resolve; }));
  const request = chat.session.update();
  chat.setTime(105);
  finish(page([message("late", 101)], 102));
  await request;
  assert.equal(chat.state.status, "Catching up…", "a slow response must use the latest playhead");
  chat.replies.push(page([message("ahead", 120)], 121));
  await chat.session.update();
  assert.equal(chat.state.status, "Synced with video");
});

test("a non-advancing page exposes a recoverable stall instead of looping", async () => {
  const chat = setup();
  chat.replies.push(page([message("old", 80)], 85));
  await chat.session.resync();
  assert.equal(chat.state.status, "Replay stalled");
  assert.match(chat.state.error, /stopped advancing/);
  await chat.session.update();
  assert.equal(chat.requests.length, 1);
  chat.replies.push(page([message("fresh", 120)], 121));
  await chat.session.resync();
  assert.equal(chat.state.status, "Synced with video");
});

test("an exhausted live archive is queried again as playback advances", async () => {
  const chat = setup();
  chat.replies.push(page([], null));
  await chat.session.resync();
  assert.equal(chat.state.status, "End of available replay");
  for (const time of [105, 110, 115]) {
    chat.setTime(time);
    await chat.session.update();
  }
  assert.equal(chat.requests.length, 1);
  chat.setTime(116);
  chat.replies.push(page([message("newly-available", 130)], 131));
  await chat.session.update();
  assert.equal(chat.requests.at(-1).offset, 101);
  assert.equal(chat.state.status, "Synced with video");
  assert.equal(chat.resets, 1, "background refresh must not reset the viewer's scroll position");
});

test("HTTP errors retain their message and a buffered replay can be retried", async () => {
  const chat = setup();
  chat.replies.push(page([message("existing", 110)], 111));
  await chat.session.resync();
  chat.replies.push(Response.json({ error: "Twitch is temporarily unavailable" }, { status: 502 }));
  await chat.session.update();
  assert.equal(chat.state.status, "Replay stalled");
  assert.equal(chat.state.error, "Twitch is temporarily unavailable");
  assert.deepEqual(chat.state.messages.map((item) => item.id), ["existing"]);
  chat.replies.push(page([message("recovered", 120)], 121));
  await chat.session.resync();
  assert.equal(chat.state.error, "");
  assert.deepEqual(chat.state.messages.map((item) => item.id), ["recovered"]);
});


test("disposing a session aborts requests and prevents late updates", async () => {
  const chat = setup();
  let finish;
  chat.replies.push(() => new Promise((resolve) => { finish = resolve; }));
  const request = chat.session.resync();
  const state = chat.state;
  chat.session.stop();
  assert.equal(chat.requests[0].signal.aborted, true);
  finish(page([message("late", 120)], 121));
  await request;
  await chat.session.update();
  await chat.session.resync();
  assert.equal(chat.state, state);
  assert.equal(chat.requests.length, 1);
});
