"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import { useLocalStorage } from "@/lib/hooks";

const NO_TRACKS: readonly string[] = [];

function trackName(track: TextTrack) {
  return track.label || track.language || "Captions";
}

function cueRow(cue: TextTrackCue) {
  const line = (cue as VTTCue).line;
  return typeof line === "number" ? line : 0;
}

/** Twitch carries captions as CEA-608 data inside the video, so a track only exists once a segment with captions has been read. */
export function useCaptions(videoRef: RefObject<HTMLVideoElement | null>, cuesRef: RefObject<HTMLElement | null>, src: string) {
  const [preferred, setPreferred] = useLocalStorage<string | null>("phantom-captions", null);
  const [found, setFound] = useState<{ src: string; tracks: readonly string[] }>({ src: "", tracks: NO_TRACKS });
  const tracks = found.src === src ? found.tracks : NO_TRACKS;
  const selected = preferred === null ? null : tracks.includes(preferred) ? preferred : tracks[0] ?? null;
  const [videoOnly, setVideoOnly] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // iOS fullscreen shows the video alone, without the stage around it.
    const sync = () => setVideoOnly(Boolean((video as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen));
    video.addEventListener("webkitbeginfullscreen", sync);
    video.addEventListener("webkitendfullscreen", sync);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", sync);
      video.removeEventListener("webkitendfullscreen", sync);
    };
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTrack = (event: Event) => {
      const track = (event as TrackEvent).track;
      if (!(track instanceof TextTrack) || track.kind !== "captions") return;
      const name = trackName(track);
      setFound((current) => {
        const known = current.src === src ? current.tracks : NO_TRACKS;
        return known.includes(name) ? current : { src, tracks: [...known, name].sort() };
      });
    };
    // hls.js keeps one track per caption channel across sources and announces a reused one on the video itself.
    video.textTracks.addEventListener("addtrack", onTrack);
    video.addEventListener("addtrack", onTrack);
    return () => {
      video.textTracks.removeEventListener("addtrack", onTrack);
      video.removeEventListener("addtrack", onTrack);
    };
  }, [videoRef, src]);

  useEffect(() => {
    const video = videoRef.current;
    const container = cuesRef.current;
    if (!video || !container) return;

    let active: TextTrack | null = null;
    for (const track of Array.from(video.textTracks)) {
      if (track.kind !== "captions") continue;
      const chosen = active === null && trackName(track) === selected;
      // A hidden track still reports its cues, and the stage draws them in place of the browser.
      // The browser draws them itself when only the video is on screen.
      track.mode = chosen ? (videoOnly ? "showing" : "hidden") : "disabled";
      if (chosen) active = track;
    }
    if (!active || videoOnly) return;

    const shown = active;
    const paint = () => {
      // Each cue is one caption row, and hls.js adds the lower rows bottom first. Only the two lowest stay on screen so the text never climbs over the picture.
      const lines = Array.from(shown.activeCues ?? []).sort((a, b) => cueRow(a) - cueRow(b)).slice(-2).map((cue) => {
        const line = document.createElement("span");
        line.className = "stage-cue";
        const vtt = cue as VTTCue;
        if (typeof vtt.getCueAsHTML === "function") line.append(vtt.getCueAsHTML());
        else line.textContent = vtt.text ?? "";
        return line;
      });
      container.replaceChildren(...lines);
    };

    paint();
    shown.addEventListener("cuechange", paint);
    return () => {
      shown.removeEventListener("cuechange", paint);
      container.replaceChildren();
    };
  }, [videoRef, cuesRef, selected, tracks, videoOnly]);

  const toggle = useCallback(() => {
    if (tracks.length > 0) setPreferred(selected ? null : tracks[0]);
  }, [selected, setPreferred, tracks]);

  return { tracks, selected, select: setPreferred, toggle };
}

export type Captions = ReturnType<typeof useCaptions>;
