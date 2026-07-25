"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

export interface Chapter {
  label: string;
  start: number;
  end: number;
  /** True when the label names something a viewer would want to skip past. */
  skippable: boolean;
}

/**
 * Words that mark a segment as worth jumping. Kept deliberately narrow: the
 * point is to act on what a stream declares, not to guess.
 */
const SKIPPABLE = /\b(intro|opening|title sequence|recap|previously|advert|ad break|sponsor)\b/i;

function readChapters(video: HTMLVideoElement): Chapter[] {
  const tracks = Array.from(video.textTracks).filter(
    (track) => track.kind === "chapters"
  );

  const chapters: Chapter[] = [];
  for (const track of tracks) {
    for (const cue of Array.from(track.cues ?? [])) {
      const label = (cue as VTTCue).text?.trim() || (cue.id ?? "").trim();
      if (!label || !Number.isFinite(cue.startTime)) continue;
      chapters.push({
        label,
        start: cue.startTime,
        end: Number.isFinite(cue.endTime) ? cue.endTime : cue.startTime,
        skippable: SKIPPABLE.test(label),
      });
    }
  }
  return chapters.sort((left, right) => left.start - right.start);
}

/**
 * Chapters, when the stream carries them.
 *
 * There is no public source of intro and credit timings for film and
 * television — the services that offer "skip intro" generate those markers
 * themselves from the files they host, and the one open dataset that exists
 * (AniSkip) covers anime only. So this reads the markers the media itself
 * declares and offers nothing when there are none, rather than guessing at a
 * fixed offset that would be wrong for most of what it is applied to.
 */
export function useChapters(
  videoRef: RefObject<HTMLVideoElement | null>,
  /** Changes whenever a different stream is attached. */
  streamKey: string | null
): Chapter[] {
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const sync = useCallback(() => {
    const video = videoRef.current;
    setChapters(video ? readChapters(video) : []);
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamKey) {
      setChapters([]);
      return;
    }

    // Cues arrive after the track loads, which can be well after metadata.
    const tracks = video.textTracks;
    tracks.addEventListener("addtrack", sync);
    tracks.addEventListener("change", sync);
    video.addEventListener("loadedmetadata", sync);
    const settle = window.setTimeout(sync, 1_200);

    return () => {
      tracks.removeEventListener("addtrack", sync);
      tracks.removeEventListener("change", sync);
      video.removeEventListener("loadedmetadata", sync);
      window.clearTimeout(settle);
    };
  }, [streamKey, sync, videoRef]);

  return chapters;
}
