"use client";

import { type PointerEvent, useEffect, useMemo, useRef } from "react";
import { PLAYER_SEEK_SECONDS } from "./use-stage-playback";
import { formatTimecode } from "./timecode";
import type { TimeListener } from "./timecode";

import { EMPTY_PLAYBACK_SEGMENTS, normalizePlaybackSegments, playbackSegmentLabelsAt } from "./playback-segments";
import type { PlaybackSegment, SegmentAppearances } from "./playback-segments";
import { ScrubSegments } from "./scrub-segments";
import { ScrubTooltip } from "./scrub-tooltip";
import type { ScrubTooltipHandle } from "./scrub-tooltip";

export interface ScrubBarProps {
  subscribe: (listener: TimeListener) => () => void;
  onSeek: (seconds: number) => void;
  onSeekStep?: (direction: -1 | 1) => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
  segments?: readonly PlaybackSegment[];
  segmentAppearances?: SegmentAppearances;
  /** Absolute media time at the start of the displayed viewport. */
  timelineStart?: number;
}

function percent(value: number, total: number): string {
  if (!(total > 0)) return "0%";
  return `${Math.max(0, Math.min(1, value / total)) * 100}%`;
}

export function ScrubBar({
  subscribe,
  onSeek,
  onSeekStep,
  onScrubbingChange,
  segments = EMPTY_PLAYBACK_SEGMENTS,
  segmentAppearances,
  timelineStart = 0,
}: ScrubBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<ScrubTooltipHandle>(null);
  const validSegments = useMemo(() => normalizePlaybackSegments(segments), [segments]);
  const labelsAt = (time: number) => playbackSegmentLabelsAt(validSegments, timelineStart + time);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const scrubbingRef = useRef(false);
  const pendingRatioRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribe(({ currentTime, duration, bufferedTo }) => {
      durationRef.current = duration;
      currentTimeRef.current = currentTime;
      const rail = railRef.current;
      const root = rootRef.current;
      if (!rail || !root) return;

      root.style.setProperty("--buffered", percent(bufferedTo, duration));
      if (!scrubbingRef.current) {
        root.style.setProperty("--played", percent(currentTime, duration));
      }
      rail.setAttribute("aria-valuemax", String(Math.round(duration)));
      rail.setAttribute("aria-valuenow", String(Math.round(currentTime)));
      rail.setAttribute(
        "aria-valuetext",
        `${formatTimecode(currentTime)} of ${formatTimecode(duration)}${playbackSegmentLabelsAt(validSegments, timelineStart + currentTime).map((label) => `, ${label}`).join("")}`,
      );
    });
  }, [subscribe, validSegments, timelineStart]);

  const ratioAt = (clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const previewAt = (ratio: number) => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--hover", `${ratio * 100}%`);
    const time = ratio * durationRef.current;
    tooltipRef.current?.preview(time, labelsAt(time));
  };

  const setScrubbing = (scrubbing: boolean) => {
    scrubbingRef.current = scrubbing;
    rootRef.current?.classList.toggle("scrub-scrubbing", scrubbing);
    onScrubbingChange?.(scrubbing);
  };

  const previewSeek = (ratio: number) => {
    pendingRatioRef.current = ratio;
    rootRef.current?.style.setProperty("--played", `${ratio * 100}%`);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || durationRef.current <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    previewSeek(ratioAt(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const ratio = ratioAt(event.clientX);
    rootRef.current?.classList.add("scrub-hovering");
    previewAt(ratio);
    if (scrubbingRef.current) previewSeek(ratio);
  };

  const endScrub = (
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    if (!scrubbingRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const ratio = pendingRatioRef.current;
    pendingRatioRef.current = null;
    setScrubbing(false);
    rootRef.current?.classList.remove("scrub-hovering");
    if (!cancelled && ratio !== null) {
      onSeek(ratio * durationRef.current);
    } else {
      rootRef.current?.style.setProperty(
        "--played",
        percent(currentTimeRef.current, durationRef.current),
      );
    }
  };

  return (
    <div ref={rootRef} className="scrub">
      <button
        ref={railRef}
        type="button"
        className="scrub-hit"
        aria-label="Seek"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        onKeyDown={(event) => {
          const time = currentTimeRef.current;
          const duration = durationRef.current;
          const targets: Record<string, number> = {
            ArrowLeft: time - PLAYER_SEEK_SECONDS,
            ArrowDown: time - PLAYER_SEEK_SECONDS,
            ArrowRight: time + PLAYER_SEEK_SECONDS,
            ArrowUp: time + PLAYER_SEEK_SECONDS,
            Home: 0,
            End: duration,
            PageDown: time - duration / 10,
            PageUp: time + duration / 10,
          };
          const target = targets[event.key];
          if (target === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          if (duration <= 0) return;
          if (onSeekStep && event.key.startsWith("Arrow")) {
            onSeekStep(event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1);
          } else {
            onSeek(Math.max(0, Math.min(duration, target)));
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={(event) => endScrub(event, true)}
        onPointerLeave={() =>
          rootRef.current?.classList.remove("scrub-hovering")
        }
      >
        <span className="scrub-track">
          <span className="scrub-buffered" />
          <span className="scrub-hover" />
          <span className="scrub-played" />
          <ScrubSegments segments={validSegments} appearances={segmentAppearances}
            timelineStart={timelineStart} subscribe={subscribe} />
        </span>
        <span className="scrub-head" />
      </button>
      <ScrubTooltip ref={tooltipRef} />
    </div>
  );
}
