"use client";

import { type PointerEvent, useRef, useState } from "react";
import { formatTimecode } from "@/lib/media";

interface ScrubBarProps {
  currentTime: number;
  duration: number;
  bufferedTo: number;
  onSeek: (seconds: number) => void;
}

/**
 * A pointer-driven timeline rather than an `<input type="range">`: it has to
 * show how much is buffered and preview the time under the cursor, neither of
 * which a native range control can do. Keyboard seeking lives on the stage, so
 * this stays focusable and arrow keys still work through it.
 */
export function ScrubBar({
  currentTime,
  duration,
  bufferedTo,
  onSeek,
}: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const ratioAt = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const seekToPointer = (clientX: number) => {
    if (duration > 0) onSeek(ratioAt(clientX) * duration);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    seekToPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    setHoverRatio(ratioAt(event.clientX));
    if (scrubbing) seekToPointer(event.clientX);
  };

  const endScrub = (event: PointerEvent<HTMLButtonElement>) => {
    if (!scrubbing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setScrubbing(false);
  };

  const played = duration > 0 ? (currentTime / duration) * 100 : 0;
  const buffered = duration > 0 ? (bufferedTo / duration) * 100 : 0;
  const hoverPercent = hoverRatio === null ? null : hoverRatio * 100;

  return (
    <button
      type="button"
      className={`scrub ${scrubbing ? "scrub-scrubbing" : ""}`}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatTimecode(currentTime)} of ${formatTimecode(duration)}`}
      role="slider"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={() => setHoverRatio(null)}
    >
      <div ref={trackRef} className="scrub-track">
        <span className="scrub-buffered" style={{ width: `${buffered}%` }} />
        {hoverPercent !== null && (
          <span className="scrub-hover" style={{ width: `${hoverPercent}%` }} />
        )}
        <span className="scrub-played" style={{ width: `${played}%` }} />
      </div>
      <span className="scrub-head" style={{ left: `${played}%` }} />
      {hoverPercent !== null && duration > 0 && (
        <span className="scrub-tooltip" style={{ left: `${hoverPercent}%` }}>
          {formatTimecode((hoverRatio ?? 0) * duration)}
        </span>
      )}
    </button>
  );
}
