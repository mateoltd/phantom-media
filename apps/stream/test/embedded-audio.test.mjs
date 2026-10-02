import assert from "node:assert/strict";
import test from "node:test";
import { preferEnglishAudioInTs } from "../src/embedded-audio.mjs";

// A minimal TS packet containing only a valid program map, not media payload.
const PROGRAM_MAP = "02b0280001c10000e100f0001be100f0000fe101f0060a0468696e000fe102f0060a04656e67002bf0dc60";

test("the embedded English AAC track becomes the first audio program", () => {
  const packet = new Uint8Array(188).fill(0xff);
  packet.set([0x47, 0x50, 0x00, 0x10, 0x00]);
  packet.set(Buffer.from(PROGRAM_MAP, "hex"), 5);
  const result = preferEnglishAudioInTs(packet.buffer);
  assert.deepEqual(result, { found: true, english: true, reordered: true });
  const english = packet.findIndex((_, index) =>
    Buffer.from(packet.subarray(index, index + 3)).toString() === "eng");
  const hindi = packet.findIndex((_, index) =>
    Buffer.from(packet.subarray(index, index + 3)).toString() === "hin");
  assert.ok(english > 0 && english < hindi);
  assert.deepEqual(preferEnglishAudioInTs(packet.buffer), {
    found: true, english: true, reordered: false,
  });
});
