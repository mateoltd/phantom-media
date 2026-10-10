"use client";

import { useCallback } from "react";
import { ScrubBar, type PlaybackSegment, type TimeListener } from "@phantom/ui";
import { formatTime } from "@/lib/format";

/** The same timeline control used by the player, for independently browsable resources. */
export function RecordingPosition({ label, position, duration, onSeek, segments }: {
  label: string; position: number; duration: number; onSeek: (position: number) => void; segments?: readonly PlaybackSegment[];
}) {
  const subscribe = useCallback((listener: TimeListener) => {
    listener({ currentTime: position, duration, bufferedTo: 0 });
    return () => {};
  }, [position, duration]);
  return <div className="still-recording-position" role="group" aria-label={label}>
    <div className="still-resource-row"><span>{label}</span><time className="still-resource-number">{formatTime(position)}</time></div>
    <ScrubBar subscribe={subscribe} onSeek={onSeek} segments={segments} />
  </div>;
}
