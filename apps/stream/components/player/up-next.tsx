"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import type { EpisodeSummary } from "@/lib/types";
import type { TimeListener } from "./use-video-state";

interface UpNextProps {
  episode: EpisodeSummary;
  subscribe: (listener: TimeListener) => () => void;
  onPlay: () => void;
}

/**
 * How close to the end counts as "the credits". Proportional, because a
 * forty-minute episode and a two-hour film do not end over the same stretch,
 * and bounded so it is neither a flash nor a banner across the last act.
 */
function creditsWindow(duration: number): number {
  return Math.max(45, Math.min(150, duration * 0.06));
}

/**
 * Offers the next episode over the tail of this one. Visibility is a class,
 * so a card that depends on the playhead does not re-render the player.
 */
export function UpNext({ episode, subscribe, onPlay }: UpNextProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribe(({ currentTime, duration }) => {
        const near =
          duration > 0 && duration - currentTime <= creditsWindow(duration);
        rootRef.current?.classList.toggle("stage-upnext-visible", near);
      }),
    [subscribe]
  );

  return (
    <div ref={rootRef} className="stage-upnext">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-stage-muted">
        Up next
      </p>

      <div className="mt-2 flex items-center gap-3">
        <span className="relative aspect-video w-[92px] shrink-0 overflow-hidden rounded-lg bg-stage-raised">
          {episode.stillUrl && (
            <Image
              src={episode.stillUrl}
              alt=""
              fill
              sizes="92px"
              unoptimized
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-[10px] text-stage-muted">
            S{episode.seasonNumber}E{episode.episodeNumber}
          </span>
          <span className="line-clamp-2 block text-[12px] font-bold leading-tight text-stage-text">
            {episode.name}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={onPlay}
        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-phantom text-[12px] font-extrabold text-white transition-colors hover:bg-phantom-dark"
      >
        <IconPlayerPlayFilled size={13} />
        Play next
      </button>
    </div>
  );
}
