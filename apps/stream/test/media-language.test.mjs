import assert from "node:assert/strict";
import test from "node:test";
import {
  audioLanguageName,
  candidateAudioLanguages,
  dashAudioLanguages,
  hlsAudioLanguages,
  matchesAudioLanguage,
  normalizeAudioLanguage,
} from "../src/media-language.mjs";

test("normalizes language names and ISO-639 variants", () => {
  assert.equal(normalizeAudioLanguage("English"), "en");
  assert.equal(normalizeAudioLanguage("spa"), "es");
  assert.equal(normalizeAudioLanguage("HIN"), "hi");
  assert.equal(normalizeAudioLanguage("fr-FR"), "fr");
});

test("unknown audio is exposed as an explicit unverified choice", () => {
  assert.equal(audioLanguageName("und"), "Unverified");
  assert.equal(normalizeAudioLanguage("Original"), "und");
  assert.equal(normalizeAudioLanguage("Default"), "und");
  assert.deepEqual(
    candidateAudioLanguages({
      type: "hls",
      audioTracks: [{ label: "Original" }, { label: "Unknown" }],
    }),
    [],
  );
  assert.equal(matchesAudioLanguage({ type: "hls" }, "und"), true);
  assert.equal(
    matchesAudioLanguage({ type: "hls", language: "fr" }, "und"),
    false,
  );
});

test("extracts structured HLS alternate-audio languages", () => {
  const manifest = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="es-ES",NAME="Español"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"
video.m3u8
`;
  assert.deepEqual(hlsAudioLanguages(manifest), ["en", "es"]);
});

test("extracts DASH audio adaptation languages", () => {
  const manifest = `<MPD>
  <Period>
    <AdaptationSet contentType="video"><Representation id="v" /></AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="fra">
      <Representation id="a1" />
    </AdaptationSet>
    <AdaptationSet contentType="audio">
      <Representation id="a2" lang="de-DE" />
    </AdaptationSet>
  </Period>
</MPD>`;
  assert.deepEqual(dashAudioLanguages(manifest), ["fr", "de"]);
});

test("strict matching rejects unknown and mismatched audio", () => {
  const unknown = { type: "hls", audioTracks: [] };
  const french = {
    type: "hls",
    audioTracks: [{ language: "fr", label: "French" }],
  };
  assert.equal(matchesAudioLanguage(unknown, "en"), false);
  assert.equal(matchesAudioLanguage(french, "en"), false);
  assert.equal(matchesAudioLanguage(french, "fr"), true);
  assert.deepEqual(candidateAudioLanguages(french), ["fr"]);
});
