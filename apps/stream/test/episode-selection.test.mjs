import assert from "node:assert/strict";
import test from "node:test";
import {
  episodeSelectionFromUrl,
  parseEpisodeSelection,
  resolveEpisodeSelection,
  urlWithEpisodeSelection,
} from "../src/episode-selection.mjs";

const seasons = [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 5 }];
const episodes = [
  { seasonNumber: 0, episodeNumber: 1 },
  { seasonNumber: 1, episodeNumber: 1 },
  { seasonNumber: 1, episodeNumber: 2 },
  { seasonNumber: 5, episodeNumber: 2 },
];

test("parses a complete, valid episode selection", () => {
  assert.deepEqual(parseEpisodeSelection("5", "2"), { season: 5, episode: 2 });
});

test("rejects partial and malformed episode selections", () => {
  assert.equal(parseEpisodeSelection("5", undefined), null);
  assert.equal(parseEpisodeSelection(undefined, "2"), null);
  assert.equal(parseEpisodeSelection("-1", "2"), null);
  assert.equal(parseEpisodeSelection("5", "0"), null);
  assert.equal(parseEpisodeSelection(["5"], "2"), null);
});

test("resolves an episode that exists in the catalog", () => {
  assert.deepEqual(
    resolveEpisodeSelection(seasons, episodes, { season: 5, episode: 2 }),
    { season: 5, episode: 2 },
  );
});

test("falls back to the first regular listed episode", () => {
  assert.deepEqual(
    resolveEpisodeSelection(seasons, episodes, { season: 8, episode: 20 }),
    { season: 1, episode: 1 },
  );
});

test("accepts explicit coordinates when no catalog listing is available", () => {
  assert.deepEqual(
    resolveEpisodeSelection([], [], { season: 5, episode: 2 }),
    { season: 5, episode: 2 },
  );
});

test("reads episode selection from a reloadable URL", () => {
  assert.deepEqual(
    episodeSelectionFromUrl(
      "https://phantom.test/watch/tv/tt123?season=5&episode=2",
      seasons,
      episodes,
    ),
    { season: 5, episode: 2 },
  );
});

test("updates episode coordinates without discarding other URL state", () => {
  assert.equal(
    urlWithEpisodeSelection(
      "https://phantom.test/watch/tv/tt123?debug=1&season=1#player",
      { season: 5, episode: 2 },
    ),
    "/watch/tv/tt123?debug=1&season=5&episode=2#player",
  );
});
