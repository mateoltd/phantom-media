import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeReplayMessages, messagesAtTime, parseChatLine } from "../lib/chat/messages.ts";

const message = (id, offset) => ({ id, offset, user: "viewer", color: "#ffffff", text: id });

test("replay follows playback time, including pauses and backward seeks", () => {
  const buffer = [message("first", 10), message("now", 20), message("future", 21)];
  assert.deepEqual(messagesAtTime(buffer, 20).map((item) => item.id), ["first", "now"]);
  assert.deepEqual(messagesAtTime(buffer, 20).map((item) => item.id), ["first", "now"]);
  assert.deepEqual(messagesAtTime(buffer, 10).map((item) => item.id), ["first"]);
  assert.deepEqual(messagesAtTime(buffer, 0), []);
});

test("overlapping comment pages deduplicate by ID and preserve timestamp order", () => {
  const buffer = mergeReplayMessages([message("one", 10), message("two", 12)], [message("two", 12), message("three", 11)]);
  assert.deepEqual(buffer.map((item) => item.id), ["one", "three", "two"]);
  assert.equal(mergeReplayMessages([], Array.from({ length: 1600 }, (_, i) => message(String(i), i))).length, 1500);
});

test("IRC parser keeps message text, decodes tags, and rejects invalid colors", () => {
  const parsed = parseChatLine('@id=abc-123;display-name=Viewer;color=bad :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :Hello <3');
  assert.equal(parsed.text, "Hello <3");
  assert.equal(parsed.user, "Viewer");
  assert.match(parsed.color, /^#[a-f0-9]{6}$/i);
  assert.equal(parseChatLine("PING :tmi.twitch.tv"), null);
});
