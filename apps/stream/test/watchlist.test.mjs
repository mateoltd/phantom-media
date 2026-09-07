import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWatchlist, toggleWatchlist } from "../lib/watchlist.ts";

const title = {
  id: "tt1234567", mediaType: "movie", title: "A saved film",
  posterUrl: null, year: "2026", rating: 8, savedAt: 100,
};

test("loads valid titles newest first, ignoring invalid entries and duplicates", () => {
  const series = { ...title, mediaType: "tv", savedAt: 200 };
  assert.deepEqual(parseWatchlist(JSON.stringify([
    null, { ...title, id: "../invalid" }, title, title, series,
    { ...title, id: "tt7654321", rating: "8" },
  ])), [series, title]);
  assert.deepEqual(parseWatchlist(null), []);
  assert.throws(() => parseWatchlist("broken json"));
  assert.throws(() => parseWatchlist("{}"));
});

test("saves only display metadata and removes a title without removing other types or newer browser changes", () => {
  let raw = null;
  let storageFull = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => raw,
    setItem: (_key, value) => {
      if (storageFull) throw new Error("Quota exceeded");
      raw = value;
    },
  } });
  try {
    toggleWatchlist({ ...title, overview: "Not needed for the local list" });
    assert.equal(parseWatchlist(raw).length, 1);
    assert.equal(JSON.parse(raw)[0].overview, undefined);
    assert.ok(JSON.parse(raw)[0].savedAt > 100);
    const series = { ...title, mediaType: "tv" };
    raw = JSON.stringify([...parseWatchlist(raw), series]);
    toggleWatchlist(title);
    assert.deepEqual(parseWatchlist(raw), [series]);
    toggleWatchlist(series);
    assert.deepEqual(parseWatchlist(raw), []);
    storageFull = true;
    assert.doesNotThrow(() => toggleWatchlist(title));
    assert.deepEqual(parseWatchlist(raw), [], "failed writes must not save a title");
    storageFull = false;
    toggleWatchlist(title);
    assert.equal(parseWatchlist(raw).length, 1, "saving can recover after a storage failure");
    raw = "unreadable";
    assert.doesNotThrow(() => toggleWatchlist(title));
    assert.equal(raw, "unreadable", "must not overwrite unreadable saved data");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
