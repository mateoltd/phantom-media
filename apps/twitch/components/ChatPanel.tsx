"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowsClockwise, X } from "@phosphor-icons/react/ssr";
import { Button, IconButton } from "@phantom/ui";
import type { ChatMessage } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import { useLiveChat, useReplayChat } from "./use-chat";

export function ChatPanel({ channel, vodId, time = 0, playbackSeekVersion = 0, onClose }: {
  channel: string;
  vodId?: string;
  time?: number;
  playbackSeekVersion?: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"replay" | "live">(vodId ? "replay" : "live");
  return (
    <section className="twitch-chat" aria-label={mode === "replay" ? "Chat replay" : "Live chat"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}>
      <div className="twitch-chat-heading">
        {vodId ? <div className="twitch-chat-modes" aria-label="Chat source">
          <button type="button" aria-pressed={mode === "replay"} onClick={() => setMode("replay")}>Replay</button>
          <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live chat</button>
        </div> : <h2 className="text-sm font-medium">Live chat</h2>}
        <IconButton label="Close chat" onClick={onClose} size="sm"><X weight="regular" size={18} /></IconButton>
      </div>
      {mode === "replay" && vodId
        ? <ReplayChat key={vodId} vodId={vodId} time={time} playbackSeekVersion={playbackSeekVersion} />
        : <LiveChat key={channel} channel={channel} />}
    </section>
  );
}

function LiveChat({ channel }: { channel: string }) {
  const { messages, status, retry } = useLiveChat(channel);
  return <>
    <ChatMessages messages={messages} empty={status === "Connected" ? "No messages yet. New messages will appear here." : status} />
    <div className="twitch-chat-footer"><span>{status === "Connected" ? `Live in ${channel}` : status}</span><IconButton label="Reconnect chat" onClick={retry} size="sm"><ArrowsClockwise weight="regular" size={15} /></IconButton></div>
  </>;
}

function ReplayChat({ vodId, time, playbackSeekVersion }: { vodId: string; time: number; playbackSeekVersion: number }) {
  const { messages, status, error, seekVersion, resync } = useReplayChat(vodId, time, playbackSeekVersion);
  return <>
    <ChatMessages resetKey={seekVersion} messages={messages} empty={error || (status === "Loading replay…" ? status : "No messages at this point in the video.")} error={error} onRetry={resync} onJumpToLatest={resync} />
    <div className="twitch-chat-footer"><span role="status">{status}</span><time className="font-mono">{formatTime(time)}</time><IconButton label="Resync replay" onClick={resync} size="sm"><ArrowsClockwise weight="regular" size={15} /></IconButton></div>
  </>;
}

function ChatMessages({ messages, empty, error, onRetry, onJumpToLatest, resetKey = 0 }: {
  resetKey?: number;
  messages: ChatMessage[];
  empty: string;
  error?: string;
  onRetry?: () => void;
  onJumpToLatest?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  // Restore follow before the replacement buffer can emit scroll events.
  useLayoutEffect(() => {
    followingRef.current = true;
    setFollowing(true);
  }, [resetKey]);
  useLayoutEffect(() => {
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
      </p>) : <div className="twitch-chat-empty"><p role={error ? "alert" : "status"}>{empty}</p>{error && <ReplayRetry onRetry={onRetry} />}</div>}
      {error && messages.length > 0 && <div className="p-3 text-xs text-text-tertiary"><p role="alert">{error}</p><ReplayRetry onRetry={onRetry} /></div>}
    </div>
    {!following && <button type="button" className="twitch-chat-follow" onClick={() => {
      onJumpToLatest?.();
      followingRef.current = true;
      setFollowing(true);
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    }}><ArrowDown weight="regular" size={14} /> Jump to latest</button>}
  </div>;
}

function ReplayRetry({ onRetry }: { onRetry?: () => void }) {
  return <Button variant="secondary" className="mt-3" onClick={onRetry}>
    <ArrowsClockwise weight="regular" size={15} /> Retry replay
  </Button>;
}
