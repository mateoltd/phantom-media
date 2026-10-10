"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { messagesAtTime } from "@/lib/chat/messages";
import { createReplayChatSession, type ReplayChatState } from "@/lib/chat/replay-session";

export function useReplayChat(vodId: string, time: number, playbackSeekVersion = 0) {
  const timeRef = useRef(time);
  const [state, setState] = useState<ReplayChatState>({ messages: [], status: "Loading replay…", error: "" });
  const [seekVersion, setSeekVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    const session = createReplayChatSession({
      vodId,
      getTime: () => timeRef.current,
      onChange: setState,
      onReset: () => setSeekVersion((value) => value + 1),
    });
    void session.resync();
    const timer = window.setInterval(() => void session.update(), 250);
    return () => { clearInterval(timer); session.stop(); };
  }, [vodId, retry, playbackSeekVersion]);

  const messages = useMemo(() => messagesAtTime(state.messages, time), [state.messages, time]);
  return { messages, partial: state.partial, gapAt: state.gapAt, status: state.status, error: state.error, seekVersion, resync: () => setRetry((value) => value + 1) };
}
