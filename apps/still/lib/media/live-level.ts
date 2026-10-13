import type Hls from "hls.js";
import type { BufferAppendingData, LevelLoadedData } from "hls.js";

/** Twitch's predictive fMP4 URI changes at completion; the encoded media does not. */
export function reconcilePrefetchCompletion(data: LevelLoadedData) {
  const previous = data.levelInfo?.details;
  const next = data.details;
  if (!previous?.live || !next.live || next.skippedSegments) return;
  for (const fragment of next.fragments) {
    const old = previous.fragments[Number(fragment.sn) - previous.startSN];
    if (!old || old.sn !== fragment.sn || old.cc !== fragment.cc ||
        !old.tagList.some(tag => tag[0] === "EXT-X-STILL-PREFETCH")) continue;
    if (fragment.tagList.some(tag => tag[0] === "EXT-X-STILL-PREFETCH") ||
        !old.initSegment || old.initSegment.url !== fragment.initSegment?.url ||
        old.byteRange.length || fragment.byteRange.length || old.encrypted || fragment.encrypted ||
        old.programDateTime === null || fragment.programDateTime === null ||
        Math.abs(old.programDateTime - fragment.programDateTime) > 250) continue;
    // Only reconcile this known transition within the same rendition,
    // initialization map, discontinuity and dated sequence. Keep the new
    // completed URL for future loads; ordinary HLS identity checks remain.
    old.relurl = fragment.relurl;
    old.url = fragment.url;
  }
}

/** Multiplexed fMP4 progressive chunks share one audio/video end, not two tracks. */
export function stabilizePrefetchTiming(hls: Hls, data: BufferAppendingData) {
  const { frag } = data;
  if (data.type !== "audiovideo" || !frag.initSegment ||
      !Number.isFinite(frag.endPTS)) return;
  const details = hls.levels[frag.level]?.details;
  if (!details?.live) return;
  // hls.js retains the earliest progressive chunk's end as minEndPTS. That
  // value is a cross-track boundary for TS, but a partial boundary here.
  // Using it to position the next segment repeatedly overlaps live media.
  frag.minEndPTS = frag.endPTS;
  for (let index = Number(frag.sn) + 1 - details.startSN; index < details.fragments.length; index++) {
    const next = details.fragments[index];
    if (!next || Number.isFinite(next.startPTS)) break;
    const datedOffset = next.programDateTime !== null && frag.programDateTime !== null
      ? (next.programDateTime - frag.programDateTime) / 1_000 : NaN;
    if (!Number.isFinite(datedOffset) || datedOffset <= 0) break;
    // A future segment starts after the full encoder interval, even while
    // this segment has only a partial endPTS. Moving it to that partial end
    // resets fMP4 timestamp offsets and overlaps frames on the next request.
    next.setStart(frag.start + datedOffset);
  }
}
