import assert from "node:assert/strict";
import test from "node:test";
import {
  VidzeeError,
  createVidzeeResolver,
  parseVidzeeStream,
} from "../src/providers/vidzee.mjs";

const mediaUrl = "https://img1.hscow.com/hls_mps/101654052b002af9691dee18066c7bc162bcface/720/index_287.m3u8?Expires=1790661997";
const media = { type: "tv", tmdbId: 1396, season: 3, episode: 5, audioLanguage: "en" };

test("VidZee resolves a CORS-readable HLS playlist without relaying media", async () => {
  const calls = [];
  const result = await createVidzeeResolver("e3")(media, {
    proxyOrigin: "http://localhost:3000",
    fetchImpl: async (input) => {
      calls.push(new URL(input).href);
      if (calls.length === 1) return Response.json({ url: mediaUrl, language: "Hindi", headers: {} });
      return new Response("#EXTM3U\n#EXTINF:4.0\n0.jpg", {
        headers: { "access-control-allow-origin": "*" },
      });
    },
  });
  assert.match(calls[0], /\/streams\/tv\/1396\/3\/5\?s=v6%3AHindi&e=0$/);
  assert.equal(calls[1], mediaUrl);
  assert.equal(result.candidates[0].serverLabel, "Source 31");
  assert.equal(result.candidates[0].deliveryMode, "native-direct");
  assert.equal(result.candidates[0].embeddedAudioLanguage, "en");
  assert.deepEqual(result.candidates[0].audioLanguages, []);
});

test("VidZee rejects a media host outside its direct CDN and restricted CORS", async () => {
  assert.throws(
    () => parseVidzeeStream(JSON.stringify({ url: "http://localhost/private.m3u8" })),
    VidzeeError,
  );
  await assert.rejects(
    createVidzeeResolver("e3")(media, {
      proxyOrigin: "http://localhost:3000",
      fetchImpl: async (input) =>
        new URL(input).hostname === "core.vidzee.wtf"
          ? Response.json({ url: mediaUrl })
          : new Response("#EXTM3U", {
            headers: { "access-control-allow-origin": "https://player.vidzee.wtf" },
          }),
    }),
    /blocks browser access/,
  );
});
