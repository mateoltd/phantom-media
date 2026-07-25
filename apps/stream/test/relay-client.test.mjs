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

test("hands the caller's abort signal to the upstream request", async () => {
  let seen;
  const client = new RelayClient({
    fetchImpl: async (_url, init) => {
      seen = init?.signal;
      return jsonResponse({
        sources: {
          Frost: { url: "https://play.example/frost.m3u8", type: "hls" },
        },
      });
    },
  });

  const controller = new AbortController();
  await client.resolveScraper(tvMedia, "q4", { signal: controller.signal });
  // Without this the subrequest outlives the router that gave up on it.
  assert.equal(seen, controller.signal);
});

test("a rate limit cools down every source, not just the one that hit it", async () => {
  const client = new RelayClient({
    fetchImpl: async () => jsonResponse({ error: "slow down" }, 429),
  });

  await assert.rejects(client.resolveScraper(tvMedia, "q4"), { status: 429 });

  // A limiter armed upstream is armed for all of them, so asking a different
  // source next would only deepen it.
  await assert.rejects(
    client.resolveScraper(tvMedia, "k9"),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.retryable, true);
      assert.ok(error.retryAfterMs > 0);
      assert.equal(error.details.localCooldown, true);
      return true;
    },
  );
});

test("a source that just failed is not asked again immediately", async () => {
  let calls = 0;
  const client = new RelayClient({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: "upstream broke" }, 502);
    },
  });

  await assert.rejects(client.resolveScraper(tvMedia, "q4"), { status: 502 });
  await assert.rejects(client.resolveScraper(tvMedia, "q4"), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.details.localCooldown, true);
    return true;
  });
  assert.equal(calls, 1, "the cooling source should not have been asked twice");
});

test("a second request for the same episode is served from cache", async () => {
  let calls = 0;
  const client = new RelayClient({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({
        sources: {
          Frost: { url: "https://play.example/frost.m3u8", type: "hls" },
        },
      });
    },
  });

  await client.resolveScraper(tvMedia, "q4");
  await client.resolveScraper(tvMedia, "q4");
  assert.equal(calls, 1);

  await client.resolveScraper(tvMedia, "q4", { fresh: true });
  assert.equal(calls, 2);
});
