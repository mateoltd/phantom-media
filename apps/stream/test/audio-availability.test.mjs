import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAvailableAudioLanguages,
  orderAvailableAudioLanguages,
} from "../src/audio-availability.mjs";

test("dead and cooling sources cannot advertise audio languages", () => {
  const languages = collectAvailableAudioLanguages([
    { status: "unreachable", languages: ["fr"] },
    { status: "limited", languages: ["hi"] },
    { status: "empty", languages: ["de"] },
    { status: "offered", languages: ["en"] },
    { status: "languageMismatch", languages: ["es"] },
  ]);
  assert.deepEqual(languages, ["en", "es"]);
});

test("the attached manifest contributes its actual audio tracks", () => {
  const languages = collectAvailableAudioLanguages(
    [{ status: "unreachable", languages: ["fr"] }],
    [
      { language: "es-MX", label: "Spanish" },
      { language: "eng", label: "English" },
    ],
  );
  assert.deepEqual(languages, ["es", "en"]);
});

test("unknown but playable audio is one explicit unverified option", () => {
  assert.deepEqual(
    collectAvailableAudioLanguages([
      { status: "languageUnknown", languages: [] },
      { status: "playing", languages: ["und"] },
    ]),
    ["und"],
  );
});

test("the current viable preference leads and unverified stays last", () => {
  assert.deepEqual(
    orderAvailableAudioLanguages(["und", "en", "es"], "es"),
    ["es", "en", "und"],
  );
});
