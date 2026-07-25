import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { FIELD_MAP, FRONTEND_TOKEN_SALT } from "../src/constants.mjs";
import {
  normalizeCandidate,
  DirectClient,
} from "../src/direct-client.mjs";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("normalizes a .m3u8 URL as HLS even when the provider labels it mp4", () => {
  const candidate = normalizeCandidate(
    {
      link: "https://media.example/video/master.m3u8",
      type: "mp4",
      resolution: 1080,
    },
    "sentinel_",
  );

  assert.equal(candidate.type, "hls");
  assert.equal(candidate.declaredType, "mp4");
  assert.equal(candidate.resolution, 1080);
});

test("reproduces the token exchange and movie resolver request", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });

    if (parsed.pathname === "/backend/token_") {
      return jsonResponse({
        [FIELD_MAP.token]: "server-token",
        [FIELD_MAP.timestamp]: 123456789,
      });
    }
    if (parsed.pathname === "/backend_/servers/orion_") {
      return jsonResponse({
        links: [
          {
            link: "https://media.example/master.m3u8",
            type: "hls",
            resolution: 1080,
          },
        ],
        subtitles: [],
      });
    }
    throw new Error(`Unexpected URL ${parsed}`);
  };

  const client = new DirectClient({ fetchImpl });
  const result = await client.resolveServer(
    {
      type: "movie",
      tmdbId: 1083381,
      imdbId: "tt26657236",
      title: "Backrooms",
      year: "2026",
      date: "2026-05-27",
    },
    "orion_",
  );

  assert.equal(result.candidates[0].type, "hls");
  assert.equal(calls.length, 2);

  const tokenCall = calls[0];
  const tokenBody = JSON.parse(tokenCall.options.body);
  const timestamp = tokenBody[FIELD_MAP.timestamp];
  const expected = createHash("sha512")
    .update(`${timestamp}:${FRONTEND_TOKEN_SALT}:1083381`)
    .digest("hex")
    .slice(0, 64);

  assert.equal(tokenCall.options.headers.origin, "https://player.upstream.xyz");
  assert.equal(
    tokenCall.options.headers.referer,
    "https://player.upstream.xyz/player/movie/1083381",
  );
  assert.equal(tokenBody[FIELD_MAP.frontendToken], expected);

  const resolverUrl = calls[1].url;
  assert.equal(resolverUrl.searchParams.get("b"), "movie");
  assert.equal(resolverUrl.searchParams.get(FIELD_MAP.id), "1083381");
  assert.equal(resolverUrl.searchParams.get(FIELD_MAP.token), "server-token");
  assert.equal(resolverUrl.searchParams.get(FIELD_MAP.title), "Backrooms");
});

test("adds season and episode fields for TV requests", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });

    if (parsed.pathname === "/backend/token_") {
      return jsonResponse({
        [FIELD_MAP.token]: "server-token",
        [FIELD_MAP.timestamp]: 222,
      });
    }
    return jsonResponse({
      links: [{ link: "https://media.example/episode.m3u8", type: "hls" }],
    });
  };

  const client = new DirectClient({ fetchImpl });
  await client.resolveServer(
    {
      type: "tv",
      tmdbId: 1399,
      season: 1,
      episode: 1,
      imdbId: "tt0944947",
      title: "Game of Thrones",
      year: "2011",
      date: "2011-04-17",
    },
    "berkas_",
  );

  const resolverUrl = calls[1].url;
  assert.equal(resolverUrl.searchParams.get(FIELD_MAP.season), "1");
  assert.equal(resolverUrl.searchParams.get(FIELD_MAP.episode), "1");
});

test("uses provided metadata without calling the upstream metadata route", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname);
    if (parsed.pathname === "/backend/token_") {
      return jsonResponse({
        [FIELD_MAP.token]: "server-token",
        [FIELD_MAP.timestamp]: 333,
      });
    }
    if (parsed.pathname === "/backend_/servers/orion_") {
      return jsonResponse({
        links: [{ link: "https://media.example/movie.m3u8", type: "hls" }],
      });
    }
    throw new Error(`Unexpected URL ${parsed}`);
  };

  const client = new DirectClient({ fetchImpl });
  await client.resolveServer(
    {
      type: "movie",
      tmdbId: 693134,
      imdbId: "tt15239678",
      title: "Dune: Part Two",
      year: "",
      date: "",
    },
    "orion_",
    { useProvidedMetadata: true },
  );

  assert.deepEqual(calls, ["/backend/token_", "/backend_/servers/orion_"]);
});

test("stops fallback and keeps the longest retry-after after a rate limit", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(
      { retryable: true, retry_after: 30 },
      429,
      { "retry-after": "10" },
    );
  };

  const client = new DirectClient({ fetchImpl });
  await assert.rejects(
    client.resolveAuto(
      { type: "movie", tmdbId: 693134 },
      { servers: ["orion_", "berkas_", "sentinel_"] },
    ),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterMs, 30_000);
      return true;
    },
  );
  assert.equal(calls, 1);

  await assert.rejects(
    client.resolveServer(
      {
        type: "movie",
        tmdbId: 693134,
        title: "Dune: Part Two",
        year: "2024",
        date: "2024-03-01",
      },
      "berkas_",
    ),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.details.localCooldown, true);
      return true;
    },
  );
  assert.equal(calls, 1);
});
