"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { channelPolls, watchChannelPolls, type PollState } from "@/lib/chat/poll-session";

const NO_POLLS: PollState = { history: [], skew: 0 };
const idle = () => () => {};

export function useChatPoll(channel: string, enabled = true) {
  const subscribe = useCallback((listener: () => void) => watchChannelPolls(channel, listener), [channel]);
  return useSyncExternalStore(enabled ? subscribe : idle, () => enabled ? channelPolls(channel) : NO_POLLS, () => NO_POLLS);
}

/** The local clock, ticking only while something on screen counts down. */
export function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
