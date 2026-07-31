import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackPlaybackPreferenceForHints,
  fallbackPreferenceForHints,
  sourcePlaybackHints,
} from "../src/source-observations.mjs";

function observation(status, languages, confidence = "medium") {
  return { status, languages, confidence };
}

function hints(audio, burnedInSubtitles) {
  return { audio, burnedInSubtitles, notes: [] };
}

test("Source 09 records observed English audio and Vietnamese burned-in subtitles", () => {
  const source09 = sourcePlaybackHints("z2");
  assert.deepEqual(source09.audio, {
    status: "observed",
    languages: ["en"],
    confidence: "high",
  });
  assert.deepEqual(source09.burnedInSubtitles, {
    status: "present",
    languages: ["vi"],
    confidence: "high",
  });
  assert.match(source09.notes[0].text, /English audio observed/);
  assert.match(source09.notes[1].text, /Vietnamese burned-in subtitles/);
  assert.deepEqual(source09.video, {
    adaptive: true,
    maxResolution: 1080,
    typicalResolution: null,
    confidence: "high",
  });
});

test("global source profiles retain sustainable quality and speed observations", () => {
  const source03 = sourcePlaybackHints("va");
  const source10 = sourcePlaybackHints("s7");
  const source18 = sourcePlaybackHints("n1");

  assert.equal(source03.video.maxResolution, 720);
  assert.equal(source03.burnedInSubtitles.status, "none");
  assert.equal(source10.video.maxResolution, 1080);
  assert.equal(source10.video.typicalResolution, 480);
  assert.equal(source10.performance.status, "slow");
  assert.equal(source10.performance.bufferingRisk, "high");
  assert.equal(source18.video.maxResolution, 720);
  assert.equal(source18.performance.status, "fast");

  assert.ok(
    fallbackPlaybackPreferenceForHints(source18) >
      fallbackPlaybackPreferenceForHints(source03),
  );
  assert.ok(
    fallbackPlaybackPreferenceForHints(source03) >
      fallbackPlaybackPreferenceForHints(source10),
  );
});

test("unverified English fallbacks prefer clean video, then matching subtitles", () => {
  const englishAudio = observation("observed", ["en"]);
  const sourceC = hints(englishAudio, observation("none", []));
  const sourceB = hints(
    englishAudio,
    observation("present", ["en"]),
  );
  const sourceA = hints(
    englishAudio,
    observation("present", ["fr"]),
  );
  const sourceD = hints(
    observation("observed", ["hi"]),
    observation("none", []),
  );

  const ranked = [sourceA, sourceB, sourceC, sourceD]
    .map((entry) => ({
      entry,
      score: fallbackPreferenceForHints(entry, "en"),
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);

  assert.deepEqual(ranked, [sourceC, sourceB, sourceA, sourceD]);
});

test("observations stay confidence-weighted rather than becoming verification", () => {
  const low = hints(
    observation("observed", ["en"], "low"),
    observation("none", [], "low"),
  );
  const high = hints(
    observation("observed", ["en"], "high"),
    observation("none", [], "high"),
  );
  const unknown = hints(
    observation("unknown", [], "unknown"),
    observation("unknown", [], "unknown"),
  );

  assert.ok(
    fallbackPreferenceForHints(high, "en") >
      fallbackPreferenceForHints(low, "en"),
  );
  assert.ok(
    fallbackPreferenceForHints(low, "en") >
      fallbackPreferenceForHints(unknown, "en"),
  );
});
