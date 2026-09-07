"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { formatTimecode } from "@/lib/media";
import type { TimeListener } from "./use-video-state";

interface ScrubBarProps {
  subscribe: (listener: TimeListener) => () => void;
  onSeek: (seconds: number) => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
}

function percent(value: number, total: number): string {
  if (!(total > 0)) return "0%";
  return `${Math.max(0, Math.min(1, value / total)) * 100}%`;
}

export function ScrubBar({
  subscribe,
  onSeek,
  onScrubbingChange,
}: ScrubBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const scrubbingRef = useRef(false);
  const pendingRatioRef = useRef<number | null>(null);

  useEffect(
    () =>
      subscribe(({ currentTime, duration, bufferedTo }) => {
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
          `${formatTimecode(currentTime)} of ${formatTimecode(duration)}`,
        );
      }),
    [subscribe],
  );

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
    if (tooltipRef.current) {
      tooltipRef.current.textContent = formatTimecode(
        ratio * durationRef.current,
      );
    }
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
            ArrowLeft: time - 5,
            ArrowDown: time - 5,
            ArrowRight: time + 5,
            ArrowUp: time + 5,
            Home: 0,
            End: duration,
            PageDown: time - duration / 10,
            PageUp: time + duration / 10,
          };
          const target = targets[event.key];
          if (target === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          if (duration > 0) onSeek(Math.max(0, Math.min(duration, target)));
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
        </span>
        <span className="scrub-head" />
      </button>
      <span ref={tooltipRef} className="scrub-tooltip" aria-hidden="true" />
    </div>
  );
}
