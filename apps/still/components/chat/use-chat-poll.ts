"use client";

import { useEffect, useState } from "react";
import { createPollSession, type PollState } from "@/lib/chat/poll-session";

const NO_POLLS: PollState = { history: [], skew: 0 };

export function useChatPoll(channel: string, enabled = true) {
  const [state, setState] = useState(NO_POLLS);
  useEffect(() => enabled ? createPollSession({ channel, onChange: setState }) : undefined, [channel, enabled]);
  return enabled ? state : NO_POLLS;
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
