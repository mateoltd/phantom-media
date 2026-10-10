"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useStagePlayback } from "@phantom/ui";
import type { MediaState } from "./use-media";
import type { Display } from "./use-display";

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function useControls(videoRef: RefObject<HTMLVideoElement | null>, media: MediaState, display: Display) {
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<"settings" | "sleep" | null>(null);
  const { changeVolume, toggleMute, seekBy: seekMediaBy, changeSpeed: changeMediaSpeed, speed } = media;
  const { togglePip, toggleFullscreen: toggleNativeFullscreen } = display;
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2600);
  }, [videoRef]);

  const changeMenu = useCallback((next: "settings" | "sleep" | null) => {
    setMenu(next);
    showControls();
  }, [showControls]);

  const seekBy = useCallback((delta: number) => {
    seekMediaBy(delta);
    showControls();
  }, [seekMediaBy, showControls]);
  const { feedback, togglePlayback: togglePlay, seekWithFeedback, handlePlaybackKey } = useStagePlayback(videoRef, seekBy);

  const toggleFullscreen = useCallback(() => {
    toggleNativeFullscreen();
    setMenu(null);
    showControls();
  }, [toggleNativeFullscreen, showControls]);
  const changeSpeed = useCallback((rate: number) => {
    changeMediaSpeed(rate);
    setMenu(null);
  }, [changeMediaSpeed]);

  const onVideoClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFullscreen();
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      togglePlay();
    }, 220);
  }, [toggleFullscreen, togglePlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && (
          target.isContentEditable || target.closest("a, [role='slider'], [role='dialog']") ||
          (target.closest("button") && (
            !target.closest(".stage-transport, .stage-toolbar-play") || event.key === " " || event.key === "Enter"
          ))
        ))
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (handlePlaybackKey(event)) {
        showControls();
        return;
      }
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          changeVolume(video.volume + 0.1);
          showControls();
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume(video.volume - 0.1);
          showControls();
          break;
        case "m":
          if (event.repeat) return;
          event.preventDefault();
          toggleMute();
          showControls();
          break;
        case "f":
          if (event.repeat) return;
          event.preventDefault();
          toggleFullscreen();
          break;
        case "p":
          if (event.shiftKey && !event.repeat) {
            event.preventDefault();
            togglePip();
          }
          break;
        case ",":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index > 0) changeSpeed(SPEEDS[index - 1]);
          }
          break;
        case ".":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index < SPEEDS.length - 1) changeSpeed(SPEEDS[index + 1]);
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [videoRef, changeSpeed, changeVolume, handlePlaybackKey, showControls, speed, toggleFullscreen, toggleMute, togglePip]);

  const hideControls = useCallback(() => {
    if (videoRef.current?.paused) return;
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setControlsVisible(false);
  }, [videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    const reveal = () => setControlsVisible(true);
    video?.addEventListener("pause", reveal);
    video?.addEventListener("ended", reveal);
    return () => {
      video?.removeEventListener("pause", reveal);
      video?.removeEventListener("ended", reveal);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, [videoRef]);

  return {
    idle: media.playing && !controlsVisible && menu === null,
    feedback, togglePlay, seekWithFeedback, toggleFullscreen, changeSpeed,
    onVideoClick, showControls, hideControls, menu, changeMenu,
  };
}

export type Controls = ReturnType<typeof useControls>;
