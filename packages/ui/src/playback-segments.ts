/** Provider-independent intervals in absolute media seconds, with an exclusive end. */
export interface PlaybackSegment {
  id: string;
  kind: string;
  start: number;
  end: number;
  label: string;
}

export interface SegmentAppearance {
  marker: "range" | "boundary";
  color: string;
  layer?: number;
}

export type SegmentAppearances = Readonly<Record<string, SegmentAppearance>>;

export const DEFAULT_SEGMENT_APPEARANCES: SegmentAppearances = {
  muted: { marker: "range", color: "#7c7f84" },
  topic: { marker: "boundary", color: "#141618", layer: 1 },
  chapter: { marker: "boundary", color: "#141618", layer: 1 },
};

const FALLBACK_APPEARANCE: SegmentAppearance = { marker: "range", color: "#7c7f84" };
export const EMPTY_PLAYBACK_SEGMENTS: readonly PlaybackSegment[] = [];

export function segmentAppearance(kind: string, appearances?: SegmentAppearances): SegmentAppearance {
  return appearances?.[kind] ?? DEFAULT_SEGMENT_APPEARANCES[kind] ?? FALLBACK_APPEARANCE;
}

/** Keep stable IDs and overlaps; discard unusable intervals once at the boundary. */
export function normalizePlaybackSegments(segments: readonly PlaybackSegment[]): PlaybackSegment[] {
  const ids = new Set<string>();
  return segments.filter(({ id, kind, label, start, end }) => {
    if (!id || !kind || !label || ids.has(id) || !Number.isFinite(start) ||
      !Number.isFinite(end) || start < 0 || end <= start) return false;
    ids.add(id);
    return true;
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}

/** Project an interval into a VOD or sliding DVR viewport without changing its identity. */
export function projectPlaybackSegment(segment: PlaybackSegment, timelineStart: number, duration: number) {
  if (!Number.isFinite(timelineStart) || !Number.isFinite(duration) || duration <= 0) return null;
  const start = Math.max(segment.start, timelineStart);
  const end = Math.min(segment.end, timelineStart + duration);
  if (end <= start) return null;
  return {
    left: (start - timelineStart) / duration,
    width: (end - start) / duration,
    // Clipping a chapter must not invent a new chapter boundary at the viewport edge.
    startsInViewport: segment.start >= timelineStart,
  };
}

/** A topic and muted audio can both be active. Reuse the same labels for hover and accessibility. */
export function playbackSegmentLabelsAt(segments: readonly PlaybackSegment[], time: number): string[] {
  return [...new Set(segments.filter(({ start, end }) => time >= start && time < end).map(({ label }) => label))];
}
