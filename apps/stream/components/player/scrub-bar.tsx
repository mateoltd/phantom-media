"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { formatTimecode } from "@/lib/media";
import type { TimeListener } from "./use-video-state";

interface ScrubBarProps {
  subscribe: (listener: TimeListener) => () => void;
  onSeek: (seconds: number) => void;
  /** Called on press and release so the chrome can stay awake during a drag. */
  onScrubbingChange?: (scrubbing: boolean) => void;
}

function percent(value: number, total: number): string {
  if (!(total > 0)) return "0%";
  return `${Math.max(0, Math.min(1, value / total)) * 100}%`;
}

/**
 * A pointer-driven timeline rather than an `<input type="range">`: it has to
 * show how much is buffered and preview the time under the cursor, neither of
 * which a native range control can do.
 *
 * Nothing here is React state. The playhead, the buffer and the hover preview
 * are written straight onto the element as custom properties, so sixty updates
 * a second cost sixty style writes rather than sixty renders of the player.
 */
export function ScrubBar({
  subscribe,
  onSeek,
  onScrubbingChange,
}: ScrubBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef(0);
  const scrubbingRef = useRef(false);

  useEffect(
    () =>
      subscribe(({ currentTime, duration, bufferedTo }) => {
        durationRef.current = duration;
        const rail = railRef.current;
        const root = rootRef.current;
        if (!rail || !root) return;

        root.style.setProperty("--buffered", percent(bufferedTo, duration));
        // A drag owns the playhead until it ends, so the element's own time —
        // which lags a seek on a slow source — cannot pull the head backwards.
        if (!scrubbingRef.current) {
          root.style.setProperty("--played", percent(currentTime, duration));
        }
        rail.setAttribute("aria-valuemax", String(Math.round(duration)));
        rail.setAttribute("aria-valuenow", String(Math.round(currentTime)));
        rail.setAttribute(
          "aria-valuetext",
          `${formatTimecode(currentTime)} of ${formatTimecode(duration)}`
        );
      }),
    [subscribe]
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
      tooltipRef.current.textContent = formatTimecode(ratio * durationRef.current);
    }
  };

  const setScrubbing = (scrubbing: boolean) => {
    scrubbingRef.current = scrubbing;
    rootRef.current?.classList.toggle("scrub-scrubbing", scrubbing);
    onScrubbingChange?.(scrubbing);
  };

  const seekToRatio = (ratio: number) => {
    rootRef.current?.style.setProperty("--played", `${ratio * 100}%`);
    onSeek(ratio * durationRef.current);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (durationRef.current <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    seekToRatio(ratioAt(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const ratio = ratioAt(event.clientX);
    rootRef.current?.classList.add("scrub-hovering");
    previewAt(ratio);
    if (scrubbingRef.current) seekToRatio(ratio);
  };

  const endScrub = (event: PointerEvent<HTMLButtonElement>) => {
    if (!scrubbingRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setScrubbing(false);
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={() => rootRef.current?.classList.remove("scrub-hovering")}
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
