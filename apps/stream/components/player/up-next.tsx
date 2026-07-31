"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import type { EpisodeSummary } from "@/lib/types";
import type { TimeListener } from "./use-video-state";

interface UpNextProps {
  episode: EpisodeSummary;
  subscribe: (listener: TimeListener) => () => void;
  onPlay: () => void;
  autoAdvance?: boolean;
}

function creditsWindow(duration: number): number {
  return Math.max(45, Math.min(150, duration * 0.06));
}

const COUNTDOWN_SECONDS = 8;

export function UpNext({
  episode,
  subscribe,
  onPlay,
  autoAdvance = false,
}: UpNextProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(
    () =>
      subscribe(({ currentTime, duration }) => {
        const near =
          duration > 0 && duration - currentTime <= creditsWindow(duration);
        rootRef.current?.classList.toggle("stage-upnext-visible", near);
      }),
    [subscribe],
  );

  useEffect(() => {
    if (!autoAdvance || cancelledRef.current) return;
    setCountdown(COUNTDOWN_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null;
        if (current > 1) return current - 1;
        window.clearInterval(timer);
        onPlay();
        return null;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [autoAdvance, onPlay]);

  const counting = countdown !== null;

  return (
    <div
      ref={rootRef}
      className={`stage-upnext ${counting ? "stage-upnext-visible" : ""}`}
    >
      <button
        type="button"
        onClick={onPlay}
        className="stage-upnext-card"
        aria-label={`Play S${episode.seasonNumber}E${episode.episodeNumber}, ${episode.name}`}
      >
        <span className="stage-upnext-still">
          <Artwork src={episode.stillUrl} sizes="96px" />
          <span className="stage-upnext-play" aria-hidden="true">
            <IconPlayerPlayFilled size={11} />
          </span>
        </span>
        <span className="stage-upnext-text">
          <span className="stage-upnext-label">
            {counting ? `Playing in ${countdown}s` : "Next episode"}
          </span>
          <span className="stage-upnext-title">
            <span className="stage-upnext-code">
              S{episode.seasonNumber}E{episode.episodeNumber}
            </span>
            {episode.name}
          </span>
        </span>
      </button>

      {counting && (
        <button
          type="button"
          onClick={() => {
            cancelledRef.current = true;
            setCountdown(null);
          }}
          className="stage-upnext-cancel"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
