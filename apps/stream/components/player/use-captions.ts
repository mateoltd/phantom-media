"use client";

import { useEffect, type RefObject } from "react";

/**
 * Paints subtitles into the stage instead of letting the browser do it.
 *
 * Native rendering is not controllable in any of the ways that matter here:
 * cue size cannot be set reliably, the backdrop cannot be turned off, and —
 * the reason this exists — cues sit wherever the browser wants, which is
 * underneath the control bar the moment anyone moves the mouse. The usual
 * workaround is rewriting each cue's `line`, which then fights any cue that
 * carries its own position.
 *
 * Setting the chosen track to `hidden` keeps the browser parsing it and firing
 * `cuechange` while painting nothing, so the parsing — including the small set
 * of markup WebVTT allows — is still the browser's job. `getCueAsHTML` returns
 * that already parsed, which is also why no subtitle file ever reaches
 * `innerHTML`: these are third-party text files, and treating one as markup
 * would be handing a stranger the page.
 */
export function useCaptions(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  selected: number | null,
  /** Changes when the track list is replaced, so the effect re-reads it. */
  trackKey: string,
): void {
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video) return;

    const tracks = Array.from(video.textTracks);
    tracks.forEach((track, index) => {
      // `hidden` rather than `showing`: loaded and live, but not painted.
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
