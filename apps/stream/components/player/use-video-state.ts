"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

export interface VideoState {
  playing: boolean;
  waiting: boolean;
  currentTime: number;
  duration: number;
  /** End of the buffered range the playhead is currently inside, in seconds. */
  bufferedTo: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  pictureInPicture: boolean;
}

const INITIAL: VideoState = {
  playing: false,
  waiting: false,
  currentTime: 0,
  duration: 0,
  bufferedTo: 0,
  volume: 1,
  muted: false,
  fullscreen: false,
  pictureInPicture: false,
};

const MEDIA_EVENTS = [
  "play",
  "playing",
  "pause",
  "timeupdate",
  "progress",
  "durationchange",
  "volumechange",
  "loadedmetadata",
  "canplay",
  "seeked",
  "ended",
  "emptied",
] as const;

function setTrackMode(track: TextTrack, showing: boolean): void {
  track.mode = showing ? "showing" : "disabled";
}

function bufferedAhead(video: HTMLVideoElement): number {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index += 1) {
    if (buffered.start(index) <= currentTime && currentTime <= buffered.end(index)) {
      return buffered.end(index);
    }
  }
  return currentTime;
}

/**
 * Mirrors the media element into React state and hands back the commands the
 * chrome needs. The element stays the single source of truth: nothing here
 * tracks playback independently, so the UI cannot drift from what is playing.
 */
export function useVideoState(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>
) {
  const [state, setState] = useState<VideoState>(INITIAL);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setState((current) => ({
        ...current,
        playing: !video.paused && !video.ended,
        waiting: false,
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        bufferedTo: bufferedAhead(video),
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

    for (const event of MEDIA_EVENTS) video.addEventListener(event, sync);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("enterpictureinpicture", onPipChange);
    video.addEventListener("leavepictureinpicture", onPipChange);
    sync();

    return () => {
      for (const event of MEDIA_EVENTS) video.removeEventListener(event, sync);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("enterpictureinpicture", onPipChange);
      video.removeEventListener("leavepictureinpicture", onPipChange);
    };
  }, [videoRef]);

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
    },
    [videoRef]
  );

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + delta);
    },
    [seekTo, videoRef]
  );

  const setVolume = useCallback(
    (level: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = Math.max(0, Math.min(1, level));
      // Reaching for the slider means you want to hear it.
      if (video.volume > 0) video.muted = false;
    },
    [videoRef]
  );

  const nudgeVolume = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      setVolume(video.volume + delta);
    },
    [setVolume, videoRef]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) void document.exitFullscreen();
    else void container.requestFullscreen().catch(() => {});
  }, [containerRef]);

  /** `null` turns every track off. Text tracks are element state, not React state. */
  const showTextTrack = useCallback(
    (index: number | null) => {
      const list = videoRef.current?.textTracks;
      if (!list) return;
      // Copied out of the live TextTrackList first: mutating through the media
      // element's own collection is exactly the aliasing the lint rules forbid,
      // and a snapshot is what we want to iterate anyway.
      Array.from(list).forEach((track, position) => {
        setTrackMode(track, position === index);
      });
    },
    [videoRef]
  );

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
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    nudgeVolume,
    toggleMute,
    toggleFullscreen,
    togglePictureInPicture,
    showTextTrack,
  };
}
