"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface VideoState {
  playing: boolean;
  waiting: boolean;
  ended: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  pictureInPicture: boolean;
}

export interface TimeSnapshot {
  currentTime: number;
  duration: number;
  bufferedTo: number;
}

export type TimeListener = (snapshot: TimeSnapshot) => void;

const INITIAL: VideoState = {
  playing: false,
  waiting: false,
  ended: false,
  duration: 0,
  volume: 1,
  muted: false,
  fullscreen: false,
  pictureInPicture: false,
};

const EMPTY_TIME: TimeSnapshot = { currentTime: 0, duration: 0, bufferedTo: 0 };

const STATE_EVENTS = [
  "play",
  "playing",
  "pause",
  "ended",
  "emptied",
  "durationchange",
  "volumechange",
  "loadedmetadata",
  "canplay",
] as const;

const TIME_EVENTS = [
  "timeupdate",
  "progress",
  "seeking",
  "seeked",
  "durationchange",
  "loadedmetadata",
] as const;

function bufferedAhead(video: HTMLVideoElement): number {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index += 1) {
    if (
      buffered.start(index) <= currentTime &&
      currentTime <= buffered.end(index)
    ) {
      return buffered.end(index);
    }
  }
  return currentTime;
}

function readTime(video: HTMLVideoElement): TimeSnapshot {
  return {
    currentTime: video.currentTime || 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    bufferedTo: bufferedAhead(video),
  };
}

export function useVideoState(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState<VideoState>(INITIAL);
  const listenersRef = useRef(new Set<TimeListener>());
  const frameRef = useRef<number | null>(null);

  const emitTime = useCallback(() => {
    const video = videoRef.current;
    const snapshot = video ? readTime(video) : EMPTY_TIME;
    for (const listener of listenersRef.current) listener(snapshot);
  }, [videoRef]);

  const subscribeTime = useCallback(
    (listener: TimeListener) => {
      const listeners = listenersRef.current;
      listeners.add(listener);
      const video = videoRef.current;
      listener(video ? readTime(video) : EMPTY_TIME);
      return () => {
        listeners.delete(listener);
      };
    },
    [videoRef],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setState((current) => ({
        ...current,
        playing: !video.paused && !video.ended,
        waiting: false,
        ended: video.ended,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        volume: video.volume,
        muted: video.muted,
      }));
    };
    const onWaiting = () =>
      setState((current) => ({ ...current, waiting: true }));
    const onPipChange = () =>
      setState((current) => ({
        ...current,
        pictureInPicture: document.pictureInPictureElement === video,
      }));

    for (const event of STATE_EVENTS) video.addEventListener(event, sync);
    for (const event of TIME_EVENTS) video.addEventListener(event, emitTime);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("enterpictureinpicture", onPipChange);
    video.addEventListener("leavepictureinpicture", onPipChange);
    sync();
    emitTime();

    return () => {
      for (const event of STATE_EVENTS) video.removeEventListener(event, sync);
      for (const event of TIME_EVENTS)
        video.removeEventListener(event, emitTime);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("enterpictureinpicture", onPipChange);
      video.removeEventListener("leavepictureinpicture", onPipChange);
    };
  }, [emitTime, videoRef]);

  useEffect(() => {
    if (!state.playing) return;
    const tick = () => {
      emitTime();
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [emitTime, state.playing]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setState((current) => ({
        ...current,
        fullscreen: document.fullscreenElement === containerRef.current,
      }));

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [containerRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, [videoRef]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.max(0, Math.min(seconds, video.duration));
      emitTime();
    },
    [emitTime, videoRef],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + delta);
    },
    [seekTo, videoRef],
  );

  const setVolume = useCallback(
    (level: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = Math.max(0, Math.min(1, level));
      if (video.volume > 0) video.muted = false;
    },
    [videoRef],
  );

  const nudgeVolume = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      setVolume(video.volume + delta);
    },
    [setVolume, videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      void document.exitFullscreen?.().catch(() => {});
    } else if (container.requestFullscreen) {
      void container.requestFullscreen().catch(() => {});
    } else {
      const video = videoRef.current as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null;
      video?.webkitEnterFullscreen?.();
    }
  }, [containerRef, videoRef]);

  const togglePictureInPicture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => {});
    } else {
      void video.requestPictureInPicture().catch(() => {});
    }
  }, [videoRef]);

  return {
    state,
    subscribeTime,
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    nudgeVolume,
    toggleMute,
    toggleFullscreen,
    togglePictureInPicture,
  };
}
