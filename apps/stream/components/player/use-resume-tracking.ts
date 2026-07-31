"use client";

import { type RefObject, useEffect } from "react";
import { saveResumePoint } from "@/lib/resume";

const SAVE_INTERVAL_MS = 5_000;

export function useResumeTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  key: string | null,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !key) return;

    let lastSavedAt = 0;
    const save = () => {
      lastSavedAt = Date.now();
      saveResumePoint(key, video.currentTime, video.duration);
    };
    const onTimeUpdate = () => {
      if (Date.now() - lastSavedAt < SAVE_INTERVAL_MS) return;
      save();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", save);
    video.addEventListener("ended", save);
    window.addEventListener("pagehide", save);

    return () => {
      save();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", save);
      video.removeEventListener("ended", save);
      window.removeEventListener("pagehide", save);
    };
  }, [key, videoRef]);
}
