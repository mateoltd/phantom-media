"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, RefreshCw, X } from "lucide-react";
import { IconButton } from "@phantom/ui";
import type { ChatMessage } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import { useLiveChat, useReplayChat } from "./use-chat";

export function ChatPanel({ channel, vodId, time = 0, onClose }: {
  channel: string;
  vodId?: string;
  time?: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"replay" | "live">(vodId ? "replay" : "live");
  return (
    <section className="twitch-chat" aria-label={mode === "replay" ? "Chat replay" : "Live chat"}>
      <div className="twitch-chat-heading">
        {vodId ? <div className="twitch-chat-modes" aria-label="Chat source">
          <button type="button" aria-pressed={mode === "replay"} onClick={() => setMode("replay")}>Replay</button>
          <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live chat</button>
        </div> : <h2 className="text-sm font-medium">Live chat</h2>}
        <IconButton label="Close chat" onClick={onClose} size="sm"><X size={18} /></IconButton>
      </div>
      {mode === "replay" && vodId
        ? <ReplayChat key={vodId} vodId={vodId} time={time} />
        : <LiveChat key={channel} channel={channel} />}
    </section>
  );
}

function LiveChat({ channel }: { channel: string }) {
  const { messages, status, retry } = useLiveChat(channel);
  return <>
    <ChatMessages messages={messages} empty={status === "Connected" ? "No messages yet. New messages will appear here." : status} />
    <div className="twitch-chat-footer"><span>{status === "Connected" ? `Live in ${channel}` : status}</span><IconButton label="Reconnect chat" onClick={retry} size="sm"><RefreshCw size={15} /></IconButton></div>
  </>;
}

function ReplayChat({ vodId, time }: { vodId: string; time: number }) {
  const { messages, status, error, seekVersion, retry } = useReplayChat(vodId, time);
  return <>
    <ChatMessages resetKey={seekVersion} messages={messages} empty={error || (status === "Loading replay…" ? status : "No messages at this point in the video.")} error={error} onRetry={retry} />
    <div className="twitch-chat-footer"><span>{status}</span><time className="font-mono">{formatTime(time)}</time></div>
  </>;
}

function ChatMessages({ messages, empty, error, onRetry, resetKey = 0 }: {
  resetKey?: number;
  messages: ChatMessage[];
  empty: string;
  error?: string;
  onRetry?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    followingRef.current = true;
    setFollowing(true);
  }, [resetKey]);
  useEffect(() => {
    const list = listRef.current;
    if (list && followingRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  return <div className="twitch-chat-content">
    <div ref={listRef} className="twitch-chat-messages" aria-label="Chat messages" onScroll={() => {
      const list = listRef.current;
      if (!list) return;
      const pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      followingRef.current = pinned;
      setFollowing(pinned);
    }}>
      {messages.length ? messages.map((message) => <p key={message.id} className="twitch-chat-message">
        {message.offset !== undefined && <time className="twitch-chat-timestamp">{formatTime(message.offset)}</time>}
        <span className="font-semibold" style={{ color: message.color }}>{message.user}</span>{": "}{message.text}
      </p>) : <div className="twitch-chat-empty"><p role={error ? "alert" : "status"}>{empty}</p>{error && <button type="button" className="cinema-button mt-3" onClick={onRetry}>Retry replay</button>}</div>}
      {error && messages.length > 0 && <button type="button" className="cinema-button mt-3" onClick={onRetry}>Retry replay</button>}
    </div>
    {!following && <button type="button" className="twitch-chat-follow" onClick={() => {
      followingRef.current = true;
      setFollowing(true);
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    }}><ArrowDown size={14} /> Jump to latest</button>}
  </div>;
}
