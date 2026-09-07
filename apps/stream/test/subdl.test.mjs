import test from "node:test";
import assert from "node:assert/strict";
import { subdlFileUrl, subdlTracks } from "../src/subdl.mjs";
import { toWebVtt } from "../src/subtitles.mjs";

const query = { imdbId: "tt41293157", mediaType: "tv", season: 1, episode: 2 };
const file = { file_n_id: "abc", url: "/subtitle/entry/abc?api_key=secret", language: "ES", format: "ass", season: 1, episode: 2 };
const body = files => ({ status: true, results: [{ imdb_id: query.imdbId, type: "tv" }], subtitles: [{ unpack_files: files }] });

test("SubDL strips credentials from links and matches exact episodes", () => {
  const tracks = subdlTracks(body([file, file, { ...file, episode: 3 }]), query);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].lang, "es");
  assert.equal(tracks[0].url, "https://dl.subdl.com/subtitle/entry/abc");
  assert.ok(!JSON.stringify(tracks).includes("secret"));
  assert.deepEqual(subdlTracks(body([file]), { ...query, imdbId: "tt1234567" }), []);
  assert.deepEqual(subdlTracks({ status: false }, query), []);
});

test("SubDL rejects untrusted hosts, archives, and unsupported formats", () => {
  for (const url of ["https://evil.example/subtitle/a/b", "https://dl.subdl.com.evil.example/subtitle/a/b", "/subtitle/a.zip", "https://user@dl.subdl.com/subtitle/a/b"]) {
    assert.equal(subdlFileUrl(url), null);
  }
  assert.deepEqual(subdlTracks(body([{ ...file, format: "zip" }]), query), []);
});

test("ASS events become timed Spanish cues, preserving commas and line breaks", () => {
  const vtt = toWebVtt('[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\an8}Hola, mundo\\N¡Sí!\nComment: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,Hidden');
  assert.equal(vtt, "WEBVTT\n\n00:00:01.200 --> 00:00:03.450\nHola, mundo\n¡Sí!\n");
});

test("ASS malformed times and drawing events are excluded", () => {
  const vtt = toWebVtt('[Events]\nFormat: Start, End, Text\nDialogue: bad,0:00:03.00,broken\nDialogue: 0:00:01.00,0:00:03.00,{\\p1}m 0 0 l 1 1');
  assert.equal(vtt, "WEBVTT\n\n\n");
});
