"use client";

import { useEffect, type RefObject } from "react";

export function useCaptions(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  selected: number | null,
  trackKey: string,
): void {
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video) return;

    const tracks = Array.from(video.textTracks);
    tracks.forEach((track, index) => {
      track.mode = index === selected ? "hidden" : "disabled";
    });

    if (container) container.replaceChildren();
    const active = selected === null ? null : tracks[selected];
    if (!active || !container) return;

    const paint = () => {
      const cues = Array.from(active.activeCues ?? []) as VTTCue[];
      const lines = cues.map((cue) => {
        const line = document.createElement("span");
        line.className = "stage-cue";
        if (typeof cue.getCueAsHTML === "function") {
          line.append(cue.getCueAsHTML());
        } else {
          line.textContent = cue.text;
        }
        return line;
      });
      container.replaceChildren(...lines);
      container.classList.toggle("stage-cues-empty", lines.length === 0);
    };

    paint();
    active.addEventListener("cuechange", paint);
    return () => {
      active.removeEventListener("cuechange", paint);
      container.replaceChildren();
    };
  }, [containerRef, selected, trackKey, videoRef]);
}
