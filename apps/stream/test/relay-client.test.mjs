import assert from "node:assert/strict";
import test from "node:test";
import {
  RelayClient,
  generateContentHash,
} from "../src/relay-client.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const tvMedia = {
  type: "tv",
  tmdbId: 1399,
  imdbId: "tt0944947",
  season: 1,
  episode: 1,
  title: "Game of Thrones",
  year: "2011",
};

test("reproduces the upstream content hash", () => {
  assert.equal(
    generateContentHash(tvMedia),
    "17882cc4b06855692f980c0ef5b163cb575f7f0d781cef81aa745509d6a49af8",
  );
});

test("builds movie requests without TV episode fields", async () => {
  let requestUrl;
  const movie = {
    type: "movie",
    tmdbId: 693134,
    imdbId: "tt15239678",
    title: "Dune: Part Two",
    year: "2024",
  };
  const client = new RelayClient({
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return jsonResponse({
        sources: {
          Helios: {
            server: "Helios",
            url: "https://play.example/dune.m3u8",
            type: "hls",
          },
        },
      });
    },
  });

  await client.resolveScraper(movie, "va");
  assert.equal(requestUrl.searchParams.get("type"), "movie");
  assert.equal(requestUrl.searchParams.get("tmdbId"), "693134");
  assert.equal(requestUrl.searchParams.get("imdbId"), "tt15239678");
  assert.equal(requestUrl.searchParams.has("seasonId"), false);
  assert.equal(requestUrl.searchParams.has("episodeId"), false);
  assert.equal(requestUrl.searchParams.get("secret"), generateContentHash(movie));
});

test("normalizes upstream source objects into player candidates", async () => {
  let requestUrl;
  const client = new RelayClient({
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return jsonResponse({
        sources: {
          Emerald: {
            server: "Emerald",
            url: "https://play.example/master.m3u8",
            type: "hls",
          },
        },
        captions: [{ url: "https://sub.example/en.vtt", lang: "en" }],
      });
    },
  });

  const result = await client.resolveScraper(tvMedia, "q4");
  assert.equal(requestUrl.pathname, "/api/providerv4/scrape");
  assert.equal(requestUrl.searchParams.get("scraper"), "q4");
  assert.equal(requestUrl.searchParams.get("seasonId"), "1");
  assert.equal(requestUrl.searchParams.get("episodeId"), "1");
  assert.equal(
    requestUrl.searchParams.get("secret"),
    generateContentHash(tvMedia),
  );
  // The upstream host name ("Emerald") must not survive normalisation: every
  // candidate is labelled with this source's in-house alias instead.
  assert.equal(result.serverLabel, "Source 01");
  assert.equal(result.candidates[0].serverLabel, "Source 01");
  assert.equal(result.candidates[0].server, "q4");
  assert.equal(result.candidates[0].type, "hls");
  assert.equal(result.subtitles.length, 1);
});

test("auto mode advances to the next source", async () => {
  const attempted = [];
  const client = new RelayClient({
    scrapers: ["q4", "k9"],
    fetchImpl: async (url) => {
      const scraper = new URL(url).searchParams.get("scraper");
      attempted.push(scraper);
      if (scraper === "q4") return jsonResponse({ sources: {} });
      return jsonResponse({
        sources: {
          Frost: {
            server: "Frost",
            url: "https://play.example/frost.m3u8",
            type: "hls",
          },
        },
      });
    },
  });

  const result = await client.resolveAuto(tvMedia, {
    scrapers: ["q4", "k9"],
  });
  assert.deepEqual(attempted, ["q4", "k9"]);
  assert.equal(result.server, "k9");
  assert.deepEqual(result.attemptedServers, ["q4", "k9"]);
});
