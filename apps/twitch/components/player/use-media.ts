"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface MediaOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  isLive: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlaybackSeek?: () => void;
}

export function useMedia({ videoRef, isLive, onTimeUpdate, onPlaybackSeek }: MediaOptions) {
  const seekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekableStart, setSeekableStart] = useState(0);
  const [seekableEnd, setSeekableEnd] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const syncDisplayedTime = useCallback(
    (time: number) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    },
    [onTimeUpdate]
  );

  const clearSeekFrame = useCallback(() => {
    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current);
      seekFrameRef.current = null;
    }
  }, []);

  const clampTime = useCallback(
    (time: number) => {
      if (isLive && seekableEnd > seekableStart) {
        return Math.max(seekableStart, Math.min(time, seekableEnd));
      }
      if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
      return Math.max(0, Math.min(time, duration));
    },
    [duration, isLive, seekableEnd, seekableStart]
  );

  const commitSeek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const nextTime = clampTime(time);
      pendingSeekRef.current = nextTime;
      syncDisplayedTime(nextTime);
      clearSeekFrame();
      seekFrameRef.current = requestAnimationFrame(() => {
        seekFrameRef.current = null;
        if (!videoRef.current || pendingSeekRef.current === null) return;
        videoRef.current.currentTime = pendingSeekRef.current;
      });
    },
    [videoRef, clampTime, clearSeekFrame, syncDisplayedTime]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onStop = () => setPlaying(false);
    const updateSeekable = () => {
      const ranges = video.seekable;
      if (ranges.length === 0) {
        setSeekableStart(0);
        setSeekableEnd(0);
        return;
      }

      setSeekableStart(ranges.start(0));
      setSeekableEnd(ranges.end(ranges.length - 1));
    };
    const onTime = () => {
      updateSeekable();
      const actualTime = video.currentTime;
      if (
        pendingSeekRef.current !== null &&
        Math.abs(actualTime - pendingSeekRef.current) < 0.35
      ) {
        pendingSeekRef.current = null;
      }
      syncDisplayedTime(actualTime);
    };
    const onDurationChange = () => {
      setDuration(video.duration || 0);
      updateSeekable();
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      updateSeekable();
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onPlaying = () => {
      setLoading(false);
      updateSeekable();
    };
    const onRateChange = () => setSpeed(video.playbackRate);
    const onSeeked = () => {
      pendingSeekRef.current = null;
      setLoading(false);
      updateSeekable();
      syncDisplayedTime(video.currentTime);
      onPlaybackSeek?.();
    };
    const handlers = {
      play: onPlay, pause: onStop, timeupdate: onTime, durationchange: onDurationChange,
      progress: onProgress, volumechange: onVolumeChange, waiting: onWaiting,
      canplay: onCanPlay, playing: onPlaying, ratechange: onRateChange,
      seeked: onSeeked, ended: onStop,
    } satisfies Partial<Record<keyof HTMLMediaElementEventMap, () => void>>;
    for (const [event, handler] of Object.entries(handlers)) video.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) video.removeEventListener(event, handler);
    };
  }, [videoRef, syncDisplayedTime, onPlaybackSeek]);

  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, nextVolume));
    video.volume = clamped;
    video.muted = false;
    try {
      localStorage.setItem("phantom-volume", JSON.stringify(clamped));
    } catch {}
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeed(rate);
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const stored = JSON.parse(localStorage.getItem("phantom-volume") ?? "null");
      if (typeof stored === "number" && stored >= 0 && stored <= 1) {
        video.volume = stored;
        setVolume(stored);
      }
    } catch {}
    video.disableRemotePlayback = true;
    return clearSeekFrame;
  }, [videoRef, clearSeekFrame]);

  const seekBy = useCallback((delta: number) => {
    const base = pendingSeekRef.current ?? videoRef.current?.currentTime ?? 0;
    commitSeek(base + delta);
  }, [videoRef, commitSeek]);

  return {
    playing, currentTime, duration, seekableStart, seekableEnd, buffered, volume, muted, speed, loading,
    setLoading, setSeekableStart, setSeekableEnd, syncDisplayedTime,
    commitSeek, seekBy, changeVolume, toggleMute, changeSpeed,
  };
}

export type MediaState = ReturnType<typeof useMedia>;
