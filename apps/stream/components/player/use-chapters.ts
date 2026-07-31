"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

export interface Chapter {
  label: string;
  start: number;
  end: number;
  skippable: boolean;
}

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

function chaptersMatch(left: readonly Chapter[], right: readonly Chapter[]): boolean {
  return (
    left.length === right.length &&
    left.every((chapter, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        chapter.label === candidate.label &&
        chapter.start === candidate.start &&
        chapter.end === candidate.end &&
        chapter.skippable === candidate.skippable
      );
    })
  );
}

export function useChapters(
  videoRef: RefObject<HTMLVideoElement | null>,
  streamKey: string | null
): Chapter[] {
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const sync = useCallback(() => {
    const video = videoRef.current;
    const next = video ? readChapters(video) : [];
    setChapters((current) => (chaptersMatch(current, next) ? current : next));
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamKey) {
      setChapters((current) => (current.length === 0 ? current : []));
      return;
    }

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
