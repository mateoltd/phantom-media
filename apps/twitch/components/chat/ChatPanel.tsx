"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowsClockwise, ChartBar, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Button, IconButton } from "@phantom/ui";
import { emoteImage, sanitizeChatColor, type ChatMessage } from "@/lib/chat/messages";
import { formatTime } from "@/lib/format";
import { useLiveChat } from "./use-live-chat";
import { useReplayChat } from "./use-replay-chat";
import { ChatSearch } from "./ChatSearch";
import { ChatBadge } from "./ChatBadge";

export function ChatPanel({ channel, vodId, time = 0, playbackSeekVersion = 0, onSeek, onClose }: {
  channel: string;
  vodId?: string;
  time?: number;
  playbackSeekVersion?: number;
  onClose: () => void;
  onSeek?: (time: number) => void;
}) {
  const [mode, setMode] = useState<"replay" | "live">(vodId ? "replay" : "live");
  const [tool, setTool] = useState<"search" | "reactions" | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const reactionsTrigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="twitch-chat" aria-label={mode === "replay" ? "Chat replay" : "Live chat"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (tool) {
            (tool === "search" ? searchTrigger : reactionsTrigger).current?.focus();
            setTool(null);
          } else onClose();
        }
      }}>
      <div className="twitch-chat-heading">
        {vodId ? <div className="twitch-chat-modes" aria-label="Chat source">
          <button type="button" aria-pressed={mode === "replay"} onClick={() => { setMode("replay"); setTool(null); }}>Replay</button>
          <button type="button" aria-pressed={mode === "live"} onClick={() => { setMode("live"); setTool(null); }}>Live chat</button>
        </div> : <h2 className="text-sm font-medium">Live chat</h2>}
        <div className="twitch-chat-actions">
          {mode === "replay" && onSeek && <>
            <IconButton ref={searchTrigger} label="Search chat" aria-pressed={tool === "search"} onClick={() => setTool(tool === "search" ? null : "search")} size="sm"><MagnifyingGlass size={17} /></IconButton>
            <IconButton ref={reactionsTrigger} label="Audience reactions" aria-pressed={tool === "reactions"} onClick={() => setTool(tool === "reactions" ? null : "reactions")} size="sm"><ChartBar size={17} /></IconButton>
          </>}
        </div>
      </div>
      {mode === "replay" && vodId
        ? <ReplayChat key={vodId} vodId={vodId} time={time} playbackSeekVersion={playbackSeekVersion} onSeek={onSeek} tool={tool} />
        : <LiveChat key={channel} channel={channel} />}
    </section>
  );
}

function LiveChat({ channel }: { channel: string }) {
  const { messages, status } = useLiveChat(channel);
  return <ChatMessages messages={messages} empty={status === "Connected" ? "No messages yet. New messages will appear here." : status} />;
}

function ReplayChat({ vodId, time, playbackSeekVersion, onSeek, tool }: { vodId: string; time: number; playbackSeekVersion: number; onSeek?: (time: number) => void; tool: "search" | "reactions" | null }) {
  const { messages, status, error, seekVersion, resync } = useReplayChat(vodId, time, playbackSeekVersion);
  return <>
    {tool && onSeek ? <ChatSearch vodId={vodId} time={time} onSeek={onSeek} view={tool} /> : <ChatMessages onSeek={onSeek} resetKey={seekVersion} messages={messages} empty={error || (status === "Loading replay…" ? status : "No messages at this point in the video.")} error={error} onRetry={resync} onJumpToLatest={resync} />}
    <div className="twitch-chat-footer"><span role="status">{status}</span><time className="font-mono">{formatTime(time)}</time></div>
  </>;
}

function ChatMessages({ messages, empty, error, onRetry, onJumpToLatest, onSeek, resetKey = 0 }: {
  resetKey?: number;
  onSeek?: (time: number) => void;
  messages: ChatMessage[];
  empty: string;
  error?: string;
  onRetry?: () => void;
  onJumpToLatest?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  // Source-supplied colors are data. Typography, layout and the null-color fallback live in twitch.css.
  const colors = [...new Set(messages.map(message => sanitizeChatColor(message.color)).filter(Boolean))];
  const colorRules = colors.map(color => `.twitch-chat-user[data-color="${color}"]{color:${color}}`).join("\n");
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
    <style>{colorRules}</style>
    <div ref={listRef} className="twitch-chat-messages" aria-label="Chat messages" onScroll={() => {
      const list = listRef.current;
      if (!list) return;
      const pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      followingRef.current = pinned;
      setFollowing(pinned);
    }}>
      {messages.length ? messages.map((message) => <p key={message.id} className="twitch-chat-message">
        {message.offset !== undefined && <button type="button" className="twitch-chat-timestamp" disabled={!onSeek} onClick={() => onSeek?.(message.offset!)} aria-label={`Seek to ${formatTime(message.offset)}`}>{formatTime(message.offset)}</button>}
        {message.badges?.map(badge => badge.imageUrl ? <ChatBadge key={`${badge.id}:${badge.version}`} imageUrl={badge.imageUrl} title={badge.title} /> : null)}
        <span className="twitch-chat-user" data-color={sanitizeChatColor(message.color) || undefined}>{message.user}</span>{": "}{message.fragments ? message.fragments.map((fragment, index) => <ChatFragment key={index} fragment={fragment} />) : message.text}
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

function ChatFragment({ fragment }: { fragment: { text: string; emoteId?: string } }) {
  const source = fragment.emoteId ? emoteImage(fragment.emoteId) : undefined;
  return source ? <Image unoptimized src={source} alt={fragment.text} title={fragment.text} width={28} height={28} className="inline-block align-middle" loading="lazy" /> : <span>{fragment.text}</span>;
}
