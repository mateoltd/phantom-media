"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TimeListener, TimeSnapshot } from "@phantom/ui";
import type { MediaState } from "./use-media";

export function useTimeline(media: MediaState, isLive: boolean, dvrMode: boolean) {
  const { currentTime, duration, buffered, seekableStart, seekableEnd, commitSeek } = media;
  const dvrWindow = Math.max(0, seekableEnd - seekableStart);
  const useDvrTimeline =
    dvrMode && dvrWindow > 1 && (isLive || !Number.isFinite(duration) || duration <= 0);
  const hasTimeline =
    (!isLive && Number.isFinite(duration) && duration > 0) ||
    useDvrTimeline;
  const timelineDuration = useDvrTimeline ? dvrWindow : duration;
  const timelineTime = useDvrTimeline
    ? Math.max(0, Math.min(currentTime - seekableStart, dvrWindow))
    : currentTime;
  const liveLag =
    useDvrTimeline && seekableEnd > 0 ? Math.max(0, seekableEnd - currentTime) : 0;
  const canSeek = !isLive || dvrWindow > 1;
  const timelineOffset = useDvrTimeline ? seekableStart : 0;
  const timeSnapshotRef = useRef<TimeSnapshot>({ currentTime: 0, duration: 0, bufferedTo: 0 });
  const timeListenersRef = useRef(new Set<TimeListener>());
  const subscribeTimeline = useCallback((listener: TimeListener) => {
    timeListenersRef.current.add(listener);
    listener(timeSnapshotRef.current);
    return () => { timeListenersRef.current.delete(listener); };
  }, []);
  useEffect(() => {
    const snapshot = {
      currentTime: timelineTime,
      duration: timelineDuration,
      bufferedTo: useDvrTimeline ? timelineTime : buffered,
    };
    timeSnapshotRef.current = snapshot;
    for (const listener of timeListenersRef.current) listener(snapshot);
  }, [buffered, timelineDuration, timelineTime, useDvrTimeline]);

  const seek = useCallback((time: number) => commitSeek(timelineOffset + time), [commitSeek, timelineOffset]);
  const seekToLive = useCallback(() => {
    if (seekableEnd > seekableStart) commitSeek(seekableEnd - 1);
  }, [commitSeek, seekableStart, seekableEnd]);
  return { hasTimeline, canSeek, useDvrTimeline, timelineStart: timelineOffset, liveLag, subscribe: subscribeTimeline, seek, seekToLive };
}

export type Timeline = ReturnType<typeof useTimeline>;
