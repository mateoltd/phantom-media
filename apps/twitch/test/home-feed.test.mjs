import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentBroadcast, uniqueChannels } from "../lib/discovery/feed.ts";

test("only the archive belonging to the current broadcast is marked live", () => {
  const channel = { stream: { archiveVideo: { id: "ongoing" } } };
  assert.equal(isCurrentBroadcast({ vodId: "ongoing" }, channel), true);
  assert.equal(isCurrentBroadcast({ vodId: "older" }, channel), false);
  assert.equal(isCurrentBroadcast({ vodId: "ongoing" }, { stream: null }), false);
  assert.equal(isCurrentBroadcast({ vodId: "ongoing" }, { stream: {} }), false);
});

test("scroll batches preserve existing channels when Twitch sources overlap", () => {
  const original = [{ login: "IlloJuan", title: "first" }, { login: "rickyedit" }];
  const merged = uniqueChannels([...original, { login: "illojuan", title: "duplicate" }, { login: "new" }]);
  assert.deepEqual(merged, [...original, { login: "new" }]);
});
