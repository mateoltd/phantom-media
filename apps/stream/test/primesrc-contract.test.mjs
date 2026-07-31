import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPrimeSrcLinkResponse,
  classifyPrimeSrcResolvedLink,
  parsePrimeSrcInventory,
  primeSrcInventoryUrl,
  primeSrcLinkExchangeUrl,
} from "../src/providers/primesrc-contract.mjs";

test("PrimeSrc inventory requests use its browser-visible public contract", () => {
  assert.equal(
    primeSrcInventoryUrl({
      type: "tv",
      imdbId: "TT1632701",
      season: 5,
      episode: 8,
    }).href,
    "https://primesrc.me/api/v1/s?type=tv&imdb=tt1632701&season=5&episode=8",
  );
  assert.equal(
    primeSrcInventoryUrl({ type: "movie", tmdbId: 24428 }).href,
    "https://primesrc.me/api/v1/s?type=movie&tmdb=24428",
  );
  assert.equal(
    primeSrcLinkExchangeUrl("dbyod").href,
    "https://primesrc.me/api/v1/l?key=dbyod",
  );
});

test("PrimeSrc inventory parsing keeps public language metadata and safe keys", () => {
  const inventory = parsePrimeSrcInventory({
    info: {
      type: "tv",
      title: "Suits",
      imdb_id: "tt1632701",
    },
    servers: [
      {
        name: "Filemoon",
        key: "dbyod",
        audio_language: "eng",
        audio_type: "orig",
        file_name: "Suits S05E08.mkv",
      },
      {
        name: "Filemoon",
        key: "dbyod",
        audio_language: "fr",
      },
      { name: "Invalid", key: "../secret", audio_language: "en" },
      { name: "", key: "empty-name", audio_language: "en" },
    ],
  });

  assert.deepEqual(inventory, {
    info: {
      type: "tv",
      title: "Suits",
      imdbId: "tt1632701",
    },
    servers: [
      {
        key: "dbyod",
        name: "Filemoon",
        audioLanguage: "en",
        audioType: "orig",
        fileName: "Suits S05E08.mkv",
        fileSize: null,
        quality: null,
      },
    ],
  });
});

test("PrimeSrc managed challenges are explicit and never parsed as media", () => {
  assert.equal(
    classifyPrimeSrcLinkResponse(
      new Response("<html>challenge</html>", {
        status: 403,
        headers: {
          "cf-mitigated": "challenge",
          "content-type": "text/html",
        },
      }),
    ),
    "challenge-required",
  );
  assert.equal(
    classifyPrimeSrcLinkResponse(
      new Response('{"link":"https://media.example/master.m3u8"}', {
        headers: { "content-type": "application/json" },
      }),
    ),
    "json",
  );
});

test("PrimeSrc link payloads distinguish native media from downstream embeds", () => {
  assert.deepEqual(
    classifyPrimeSrcResolvedLink({
      link: "https://media.example/video/master.m3u8?expires=123",
    }),
    {
      classification: "native",
      url: "https://media.example/video/master.m3u8?expires=123",
    },
  );
  assert.deepEqual(
    classifyPrimeSrcResolvedLink({
      link: "https://filemoon.example/e/abc",
    }),
    {
      classification: "external",
      url: "https://filemoon.example/e/abc",
    },
  );
  assert.deepEqual(classifyPrimeSrcResolvedLink({ link: "javascript:x" }), {
    classification: "invalid",
    url: null,
  });
});
