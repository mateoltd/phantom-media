import assert from "node:assert/strict";
import test from "node:test";
import {
  compareTracks,
  languageName,
  looksLikeWebVtt,
  normalizeLanguage,
  toWebVtt,
} from "../src/subtitles.mjs";

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:04,500",
  "First line.",
  "",
  "2",
  "00:01:02,250 --> 00:01:05,000",
  "Second line.",
  "",
].join("\r\n");

test("a SubRip file becomes something a track element will accept", () => {
  const vtt = toWebVtt(SRT);
  assert.ok(vtt.startsWith("WEBVTT\n\n"));
  assert.ok(vtt.includes("00:00:01.000 --> 00:00:04.500"));
  assert.ok(vtt.includes("00:01:02.250 --> 00:01:05.000"));
  // Commas in timestamps are the one thing a browser refuses outright.
  assert.ok(!/\d,\d/.test(vtt));
});

test("carriage returns and a byte-order mark do not survive", () => {
  const vtt = toWebVtt(`﻿${SRT}`);
  assert.ok(!vtt.includes("\r"));
  assert.ok(!vtt.includes("﻿"));
});

test("a file that is already WebVTT is left alone", () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello.\n";
  assert.equal(toWebVtt(vtt), vtt);
  assert.equal(looksLikeWebVtt(vtt), true);
  assert.equal(looksLikeWebVtt(SRT), false);
});

test("a WebVTT file with SubRip timestamps is repaired rather than rejected", () => {
  const broken = "WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nHello.\n";
  assert.ok(toWebVtt(broken).includes("00:00:01.000 --> 00:00:02.000"));
  // It must not gain a second header on the way through.
  assert.equal(toWebVtt(broken).match(/WEBVTT/g).length, 1);
});

test("styling a browser cannot render is stripped instead of shown", () => {
  const messy = [
    "1",
    "00:00:01,000 --> 00:00:02,000",
    '{\\an8}<font color="#ffcc00">Shouted</font> and <i>meant</i> it.',
    "",
  ].join("\n");
  const vtt = toWebVtt(messy);
  assert.ok(!vtt.includes("{\\an8}"));
  assert.ok(!vtt.includes("<font"));
  assert.ok(!vtt.includes("</font>"));
  // The tags WebVTT does understand stay.
  assert.ok(vtt.includes("<i>meant</i>"));
  assert.ok(vtt.includes("Shouted"));
});

test("cue numbers are kept, because WebVTT reads them as identifiers", () => {
  assert.ok(toWebVtt(SRT).includes("\n1\n"));
});

test("an empty file still produces a valid document", () => {
  assert.equal(toWebVtt(""), "WEBVTT\n\n\n");
  assert.equal(toWebVtt(undefined), "WEBVTT\n\n\n");
});

test("bibliographic language codes are understood", () => {
  // These are the ones no display-name table knows, and the ones older
  // subtitle catalogues use most.
  assert.equal(normalizeLanguage("ger"), "de");
  assert.equal(normalizeLanguage("fre"), "fr");
  assert.equal(normalizeLanguage("dut"), "nl");
  assert.equal(languageName("ger"), "German");
  assert.equal(languageName("fre"), "French");
});

test("regional codes collapse to their language", () => {
  assert.equal(normalizeLanguage("pt-BR"), "pt");
  assert.equal(normalizeLanguage("es_MX"), "es");
  assert.equal(normalizeLanguage("EN"), "en");
});

test("a language nobody can name still gets a label", () => {
  assert.equal(normalizeLanguage(""), "und");
  assert.equal(normalizeLanguage(undefined), "und");
  assert.equal(languageName(""), "Unknown");
  assert.equal(languageName("zzz"), "ZZZ");
});

test("common codes read as names", () => {
  assert.equal(languageName("eng"), "English");
  assert.equal(languageName("spa"), "Spanish");
  assert.equal(languageName("es"), "Spanish");
});

test("preferred languages come first, then everything else by name", () => {
  const tracks = [
    { lang: "fre" },
    { lang: "eng" },
    { lang: "spa" },
    { lang: "ara" },
  ];
  const sorted = [...tracks].sort((a, b) => compareTracks(a, b, ["es", "en"]));
  assert.deepEqual(
    sorted.map((track) => track.lang),
    ["spa", "eng", "ara", "fre"],
  );
});

test("within a language, what the playback source supplied leads", () => {
  const tracks = [
    { lang: "eng", origin: "opensubtitles", rank: 0 },
    { lang: "eng", origin: "source", rank: 9 },
  ];
  const sorted = [...tracks].sort((a, b) => compareTracks(a, b, []));
  assert.equal(sorted[0].origin, "source");
});

test("ordering falls back on the catalogue's own ranking", () => {
  const tracks = [
    { lang: "eng", origin: "opensubtitles", rank: 3 },
    { lang: "eng", origin: "opensubtitles", rank: 1 },
  ];
  const sorted = [...tracks].sort((a, b) => compareTracks(a, b, []));
  assert.equal(sorted[0].rank, 1);
});
