"use client";

import { useCallback, useState } from "react";
import { storyboardFrame } from "@/lib/previews/storyboards";
import { StoryboardFrame } from "./StoryboardFrame";
import { useStoryboard } from "./use-storyboard";

/** Only sampled-cell changes render React; the shared rail updates its exact timecode. */
export function useStoryboardPreview(url: string | undefined) {
  const [hover, setHover] = useState<{ url: string; time: number }>();
  const active = !!url && hover?.url === url;
  const resource = useStoryboard(url, active);
  const board = resource?.board;
  const onPreview = useCallback((time: number | null) => {
    if (!url) return;
    setHover(previous => {
      if (time === null) return undefined;
      const interval = board?.interval ?? 1;
      if (previous?.url === url && Math.floor(previous.time / interval) === Math.floor(time / interval)) return previous;
      return { url, time };
    });
  }, [url, board?.interval]);
  const frame = active && board ? storyboardFrame(board, hover.time) : null;
  return { onPreview, preview: frame ? <StoryboardFrame frame={frame} /> : undefined };
}
