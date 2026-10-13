import assert from "node:assert/strict";
import { after, test } from "node:test";
import Hls, { AttrList, Level, LoadStats, M3U8Parser } from "hls.js";
import { LiveAbrController } from "../lib/media/live-abr.ts";
import { stabilizePrefetchTiming } from "../lib/media/live-level.ts";

const originalSelf = globalThis.self;
globalThis.self = globalThis;
after(() => {
  if (originalSelf === undefined) delete globalThis.self;
  else globalThis.self = originalSelf;
});
const base = "https://video-edge.ttvnw.net/live/index.m3u8";
const playlist = (predictive, url = predictive ? "future.mp4" : "completed.mp4") => `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:10
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PROGRAM-DATE-TIME:2026-10-13T12:00:00.000Z
${predictive ? "#EXT-X-STILL-PREFETCH:1\n" : ""}#EXTINF:2.000,live
${url}
#EXT-X-PROGRAM-DATE-TIME:2026-10-13T12:00:02.000Z
#EXT-X-STILL-PREFETCH:1
#EXTINF:2.000,live
future-11.mp4
`;
const parse = text => M3U8Parser.parseLevelPlaylist(text, base, 0, "main", 0, null);

function merge(t, { adapter = true, before = playlist(true), after = playlist(false), modify } = {}) {
  const old = parse(before), next = parse(after);
  modify?.(old, next);
  const levelInfo = new Level({ attrs: new AttrList({ BANDWIDTH: "1000000" }), bitrate: 1_000_000, name: "1080p60", url: base });
  levelInfo.details = old;
  const hls = new Hls({ autoStartLoad: false, enableWorker: false, ...(adapter ? { abrController: LiveAbrController } : {}) });
  t.after(() => hls.destroy());
  const errors = [];
  hls.on(Hls.Events.ERROR, (_, data) => errors.push(data));
  const stats = new LoadStats();
  stats.loading = { start: performance.now() - 30, first: performance.now() - 20, end: performance.now() };
  // Exercise hls.js's actual parser, event ordering and playlist merge.
  hls.trigger(Hls.Events.LEVEL_LOADED, {
    details: next, level: 0, levelInfo, stats, networkDetails: null,
    deliveryDirectives: null, withoutMultiVariant: true,
  });
  return { old, next, errors };
}

test("the real hls.js merge rejects Twitch's rotating prefetch URI without the live adapter", t => {
  const f = merge(t, { adapter: false });
  assert.ok(f.errors.some(e => e.details === Hls.ErrorDetails.LEVEL_PARSING_ERROR));
});

test("dated fMP4 completion survives the real playlist merge and keeps the current download URL", t => {
  const f = merge(t);
  assert.equal(f.errors.length, 0);
  assert.equal(f.next.playlistParsingError, null);
  assert.equal(f.old.fragments[0].url, "https://video-edge.ttvnw.net/live/completed.mp4");
});

test("ordinary changes, other timestamps, maps, discontinuities and byte ranges retain identity validation", t => {
  for (const options of [
    { before: playlist(false, "old-completed.mp4") },
    { after: playlist(false).replace("12:00:00.000Z", "12:00:01.000Z") },
    { after: playlist(false).replace('URI="init.mp4"', 'URI="other-init.mp4"') },
    { after: playlist(false).replace("#EXT-X-MAP:", "#EXT-X-DISCONTINUITY-SEQUENCE:1\n#EXT-X-MAP:") },
    { modify: old => old.fragments[0].setByteRange("100@0") },
    { after: playlist(true, "another-future.mp4") },
  ]) {
    const f = merge(t, options);
    assert.ok(f.errors.some(e => e.details === Hls.ErrorDetails.LEVEL_PARSING_ERROR), JSON.stringify(options));
  }
});

test("progressive multiplexed timing uses the current end and does not overlap subsequent media", () => {
  const details = parse(playlist(true));
  const frag = details.fragments[0], next = details.fragments[1];
  frag.startPTS = 0;
  frag.endPTS = 1.8;
  frag.minEndPTS = 0.3; // First progressive chunk, not the whole audio/video segment.
  frag.setDuration(1.8);
  next.setStart(0.3);
  const hls = { levels: [{ details }] };
  stabilizePrefetchTiming(hls, { type: "audiovideo", frag });
  assert.equal(frag.minEndPTS, 1.8);
  assert.equal(next.start, 2, "future media keeps its full encoder interval during partial appends");
  frag.endPTS = 2;
  frag.setDuration(2);
  stabilizePrefetchTiming(hls, { type: "audiovideo", frag });
  assert.equal(next.start, 2);
  next.startPTS = 2.01;
  next.setStart(2.01);
  stabilizePrefetchTiming(hls, { type: "audiovideo", frag });
  assert.equal(next.start, 2.01, "already parsed timestamps remain authoritative");
});

test("separate audio/video tracks and non-live media retain their timing", () => {
  for (const [type, live] of [["audio", true], ["video", true], ["audiovideo", false]]) {
    const details = parse(playlist(true));
    details.live = live;
    const frag = details.fragments[0];
    frag.endPTS = 2;
    frag.minEndPTS = 0.3;
    stabilizePrefetchTiming({ levels: [{ details }] }, { type, frag });
    assert.equal(frag.minEndPTS, 0.3);
  }
});
