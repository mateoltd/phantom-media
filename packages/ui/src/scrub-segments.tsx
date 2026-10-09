"use client";

import { useEffect, useRef } from "react";
import { projectPlaybackSegment, segmentAppearance } from "./playback-segments";
import type { PlaybackSegment, SegmentAppearances } from "./playback-segments";
import type { TimeListener } from "./timecode";

interface ScrubSegmentsProps {
  segments: readonly PlaybackSegment[];
  appearances?: SegmentAppearances;
  timelineStart: number;
  subscribe: (listener: TimeListener) => () => void;
}

/** Geometry changes on metadata/window changes, never on each playback tick. */
export function ScrubSegments({ segments, appearances, timelineStart, subscribe }: ScrubSegmentsProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let lastDuration: number | null = null;
    return subscribe(({ duration }) => {
      if (lastDuration === duration) return;
      lastDuration = duration;
      segments.forEach((segment, index) => {
        const marker = rootRef.current?.children.item(index) as HTMLElement | null;
        if (!marker) return;
        const projected = projectPlaybackSegment(segment, timelineStart, duration);
        const appearance = segmentAppearance(segment.kind, appearances);
        marker.hidden = !projected || (appearance.marker === "boundary" && !projected.startsInViewport);
        if (!projected) return;
        marker.style.left = `${projected.left * 100}%`;
        marker.style.width = appearance.marker === "boundary" ? "3px" : `${projected.width * 100}%`;
      });
    });
  }, [segments, appearances, timelineStart, subscribe]);

  return (
    <span ref={rootRef} className="scrub-segments" aria-hidden="true">
      {segments.map((segment) => {
        const appearance = segmentAppearance(segment.kind, appearances);
        return <span key={segment.id} className="scrub-segment" data-segment-kind={segment.kind} data-marker={appearance.marker}
          style={{ background: appearance.color, zIndex: appearance.layer ?? 0 }} />;
      })}
    </span>
  );
}
