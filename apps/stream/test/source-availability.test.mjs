import assert from "node:assert/strict";
import test from "node:test";
import {
  sourceAvailabilityBars,
  sourceAvailabilityRank,
  sourceAvailabilityTone,
} from "../src/source-availability.mjs";

test("available sources sort before unchecked and unavailable sources", () => {
  const statuses = [
    "limited",
    "idle",
    "offered",
    "unreachable",
    "playing",
    "asking",
    "languageUnknown",
    "languageMismatch",
    "empty",
  ];
  assert.deepEqual(statuses.sort(
    (left, right) =>
      sourceAvailabilityRank(left) - sourceAvailabilityRank(right),
  ), [
    "playing",
    "offered",
    "asking",
    "idle",
    "languageUnknown",
    "languageMismatch",
    "empty",
    "unreachable",
    "limited",
  ]);
});

test("source states use intuitive availability colors", () => {
  assert.equal(sourceAvailabilityTone("playing"), "green");
  assert.equal(sourceAvailabilityTone("offered"), "green");
  assert.equal(sourceAvailabilityTone("asking"), "orange");
  assert.equal(sourceAvailabilityTone("limited"), "orange");
  assert.equal(sourceAvailabilityTone("languageUnknown"), "orange");
  assert.equal(sourceAvailabilityTone("languageMismatch"), "orange");
  assert.equal(sourceAvailabilityTone("slow"), "orange");
  assert.equal(sourceAvailabilityTone("unreachable"), "red");
  assert.equal(sourceAvailabilityTone("unplayable"), "red");
  assert.equal(sourceAvailabilityTone("idle"), "grey");
});

test("the signal meter fills as a source proves itself", () => {
  assert.equal(sourceAvailabilityBars("playing"), 5);
  assert.equal(sourceAvailabilityBars("offered"), 4);
  assert.equal(sourceAvailabilityBars("languageMismatch"), 3);
  assert.equal(sourceAvailabilityBars("asking"), 2);
  assert.equal(sourceAvailabilityBars("slow"), 2);
  assert.equal(sourceAvailabilityBars("idle"), 1);
  assert.equal(sourceAvailabilityBars("unknown status"), 1);
});

test("only a source that never answered reads as no signal", () => {
  assert.equal(sourceAvailabilityBars("unreachable"), 0);
  assert.equal(sourceAvailabilityBars("unplayable"), 0);
  assert.equal(sourceAvailabilityBars("limited"), 0);
  assert.equal(sourceAvailabilityBars("empty"), 1);
});
