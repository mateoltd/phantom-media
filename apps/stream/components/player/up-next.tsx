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
  /** Fires when the episode ends and the countdown is allowed to run out. */
  autoAdvance?: boolean;
}

/**
 * How close to the end counts as "the credits". Proportional, because a
 * forty-minute episode and a two-hour film do not end over the same stretch,
 * and bounded so it is neither a flash nor a banner across the last act.
 */
function creditsWindow(duration: number): number {
  return Math.max(45, Math.min(150, duration * 0.06));
}

/** Long enough to reach for the cancel, short enough not to be a wait. */
const COUNTDOWN_SECONDS = 8;

/**
 * Offers the next episode over the tail of this one, and takes over when the
 * episode ends.
 *
 * The end of an episode used to jump straight to the next one with no way to
 * stop it, which is the wrong default for anyone who has finished watching:
 * the credits are part of the thing, and being thrown out of them is worse
 * than one more click. A countdown keeps the convenience and gives it back a
 * way out.
 *
 * Visibility over the credits is a class, so a card that depends on the
 * playhead never re-renders the player. The countdown is state, because it
 * runs for eight seconds once.
 */
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
      <p className="eyebrow text-stage-muted">Up next</p>

      <div className="mt-2 flex items-center gap-3">
        <span className="relative aspect-video w-[92px] shrink-0 overflow-hidden rounded-lg bg-stage-raised">
          <Artwork src={episode.stillUrl} sizes="92px" />
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold text-stage-muted">
            S{episode.seasonNumber}E{episode.episodeNumber}
          </span>
          <span className="line-clamp-2 text-[12px] font-bold leading-tight text-stage-text">
            {episode.name}
          </span>
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onPlay}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-phantom text-[12px] font-extrabold text-white transition-colors hover:bg-phantom-dark"
        >
          <IconPlayerPlayFilled size={13} />
          {counting ? `Playing in ${countdown}` : "Play next"}
        </button>
        {counting && (
          <button
            type="button"
            onClick={() => {
              cancelledRef.current = true;
              setCountdown(null);
            }}
            className="h-9 shrink-0 rounded-lg px-3 text-[12px] font-bold text-stage-muted transition-colors hover:bg-white/10 hover:text-stage-text"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
