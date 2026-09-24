"use client";

import { type RefObject, useCallback, useState } from "react";

export const PLAYER_SEEK_SECONDS = 10;
export interface StageFeedback {
  id: number;
  text: string;
}

/** Keep notch, toolbar, video gestures, and keyboard actions in sync. */
export function useStagePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  seekBy: (delta: number) => void,
) {
  const [feedback, setFeedback] = useState<StageFeedback | null>(null);
  const showFeedback = useCallback((text: string) => {
    setFeedback((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => {
        if (!video.paused) showFeedback("Playing");
      }).catch(() => {});
    } else {
      video.pause();
      showFeedback("Paused");
    }
  }, [showFeedback, videoRef]);

  const seekWithFeedback = useCallback((direction: -1 | 1) => {
    seekBy(direction * PLAYER_SEEK_SECONDS);
    showFeedback(`${direction < 0 ? "−" : "+"}${PLAYER_SEEK_SECONDS}s`);
  }, [seekBy, showFeedback]);

  const handlePlaybackKey = useCallback((event: {
    key: string;
    repeat?: boolean;
    preventDefault: () => void;
  }) => {
    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        if (!event.repeat) togglePlayback();
        return true;
      case "ArrowLeft":
      case "j":
        event.preventDefault();
        seekWithFeedback(-1);
        return true;
      case "ArrowRight":
      case "l":
        event.preventDefault();
        seekWithFeedback(1);
        return true;
      default:
        return false;
    }
  }, [seekWithFeedback, togglePlayback]);

  return { feedback, showFeedback, togglePlayback, seekWithFeedback, handlePlaybackKey };
}
