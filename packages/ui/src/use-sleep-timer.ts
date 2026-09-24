"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const STORAGE_KEY = "phantom.sleepTimer";

interface SleepTimer {
  deadline: number;
  minutes: number;
}

export const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

function readTimer(): SleepTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SleepTimer;
    if (
      saved &&
      Number.isFinite(saved.deadline) &&
      SLEEP_TIMER_OPTIONS.some((minutes) => minutes === saved.minutes) &&
      saved.deadline > Date.now()
    ) return saved;
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // A blocked or invalid session store should not prevent playback.
  }
  return null;
}

const subscribeHydration = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

export function useSleepTimer(videoRef: RefObject<HTMLVideoElement | null>) {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedOnClient, hydratedOnServer);
  const [timer, setTimer] = useState<SleepTimer | null>(readTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;

    const tick = () => {
      const remaining = timer.deadline - Date.now();
      if (remaining <= 0) {
        videoRef.current?.pause();
        setTimer(null);
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {}
      } else {
        setNow(Date.now());
      }
    };

    const timeout = window.setTimeout(tick, Math.max(0, timer.deadline - Date.now()));
    const interval = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [timer, videoRef]);

  const setMinutes = useCallback((minutes: number | null) => {
    const next = minutes === null
      ? null
      : { deadline: Date.now() + minutes * 60_000, minutes };
    setTimer(next);
    setNow(Date.now());
    try {
      if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return {
    minutes: hydrated ? timer?.minutes ?? null : null,
    minutesLeft: hydrated && timer ? Math.max(1, Math.ceil((timer.deadline - now) / 60_000)) : 0,
    setMinutes,
  };
}
