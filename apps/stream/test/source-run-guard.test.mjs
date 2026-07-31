import assert from "node:assert/strict";
import test from "node:test";
import { SourceRunGuard } from "../src/source-run-guard.mjs";

test("an identical active source race is coalesced", () => {
  const guard = new SourceRunGuard();
  assert.equal(guard.begin("title:en:auto"), true);
  assert.equal(guard.begin("title:en:auto"), false);
  guard.finish("title:en:auto");
  assert.equal(guard.begin("title:en:auto"), true);
});

test("a deliberate language or source change replaces the active race", () => {
  const guard = new SourceRunGuard();
  assert.equal(guard.begin("title:en:auto"), true);
  assert.equal(guard.begin("title:es:auto"), true);
  guard.finish("title:en:auto");
  assert.equal(guard.begin("title:es:auto"), false);
  assert.equal(guard.begin("title:es:q4"), true);
});
