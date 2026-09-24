import assert from "node:assert/strict";
import { test } from "node:test";
import { channelRail, homeSlots, isCurrentBroadcast, uniqueChannels, watchFeed } from "../lib/home-feed.ts";

test("the first page always reserves at least three recommendations and fills six slots", () => {
  for (const count of [0, 1, 2, 3, 8, 20]) {
    const slots = homeSlots(count);
    assert.ok(slots.recommendations >= 3);
    assert.equal(slots.history + slots.recommendations, 6);
    assert.ok(slots.history <= count);
  }
});
test("the avatar rail reserves the final two places for suggestions and deduplicates", () => {
  const recent = Array.from({ length: 8 }, (_, i) => ({ login: `recent${i}` }));
  const suggestions = [{ login: "RECENT0" }, { login: "suggested1" }, { login: "suggested1" }, { login: "suggested2" }];
  const rail = channelRail(recent, suggestions);
  assert.equal(rail.length, 8);
  assert.deepEqual(rail.slice(-2).map((item) => [item.channel.login, item.suggested]), [["suggested1", true], ["suggested2", true]]);
  assert.ok(rail.slice(0, 6).every((item) => !item.suggested));
});
test("new visitors get recommendation avatars without requiring history", () => {
  const rail = channelRail([], [{ login: "popular" }, { login: "another" }]);
  assert.equal(rail.length, 2);
  assert.ok(rail.every((item) => item.suggested));
});


test("only the archive belonging to the current broadcast becomes a live tile", () => {
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

test("a long history leaves three discovery slots in the first six and is not lost on scroll", () => {
  const history = Array.from({ length: 20 }, (_, i) => i);
  const channels = Array.from({ length: 30 }, (_, i) => `channel${i}`);
  const feed = watchFeed(history, channels);
  assert.equal(feed.slice(0, 6).filter((item) => item.kind === "channel").length, 3);
  assert.deepEqual(feed.filter((item) => item.kind === "history").map((item) => item.entry), history);
  assert.deepEqual(feed.filter((item) => item.kind === "channel").map((item) => item.channel), channels);
  assert.deepEqual(watchFeed([], channels).map((item) => item.channel), channels);
});
