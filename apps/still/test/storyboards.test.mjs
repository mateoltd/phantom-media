import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStoryboardLoader } from "../lib/previews/storyboard-resource.ts";
import { parseStoryboards, storyboardFrame } from "../lib/previews/storyboards.ts";

// Bounded independent capture of VOD 2895228400's descriptor, 9 October 2026.
const receipt = JSON.parse(readFileSync(new URL("./fixtures/storyboard.json", import.meta.url)));
const url = "https://fixture.cloudfront.net/record/storyboards/2895228400-info.json";

test("rail and frame browser coalesce a descriptor while one caller cancels", async () => {
  let complete;
  let calls = 0;
  const response = new Promise(resolve => { complete = resolve; });
  const load = createStoryboardLoader(async () => { calls++; return response; });
  const controller = new AbortController();
  const cancelled = load(url, controller.signal);
  const retained = load(url);
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  complete(Response.json(receipt));
  const board = await retained;
  assert.equal(board.quality, "high");
  assert.equal(await load(url), board);
  assert.equal(calls, 1);
});

test("captured geometry crosses sheet boundaries and clamps the last frame", async () => {
  const board = await createStoryboardLoader(async () => Response.json(receipt))(url);
  assert.match(storyboardFrame(board, 49 * 82).url, /high-0.jpg$/);
  const next = storyboardFrame(board, 50 * 82);
  assert.match(next.url, /high-1.jpg$/);
  assert.equal(next.sourceX, 0);
  assert.equal(next.sourceY, 0);
  assert.equal(next.width, 220);
  assert.equal(next.height, 124);
  assert.equal(storyboardFrame(board, 20_000).position, 199 * 82);
  assert.equal(storyboardFrame(board, NaN), null);
});

test("failed descriptors do not poison later attempts or accept cross-origin sheets", async () => {
  let attempts = 0;
  const load = createStoryboardLoader(async () => ++attempts === 1
    ? Response.json([{ ...receipt[1], images: ["https://other.example/sheet.jpg"] }])
    : Response.json(receipt));
  await assert.rejects(load(url), /Invalid sheet/);
  assert.equal((await load(url)).count, 200);
  assert.equal(attempts, 2);
});

test("oversized descriptors abort consumption before parsing", async () => {
  let cancelled = false;
  const load = createStoryboardLoader(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(256_001)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(load(url));
  assert.equal(cancelled, true);
});

test("invalid geometry is rejected before any oversized sheet is decoded", () => {
  assert.deepEqual(parseStoryboards([
    { ...receipt[1], width: 640, height: 640, rows: 40, cols: 5 },
    { ...receipt[1], interval: Infinity },
    { ...receipt[1], count: 0 },
    { ...receipt[1], images: [] },
  ], url), []);
});
