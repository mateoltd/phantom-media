"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowsClockwise, ChartBar, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Button, IconButton } from "@phantom/ui";
import { emoteImage, sanitizeChatColor, type ChatMessage } from "@/lib/chat/messages";
import { pollAt } from "@/lib/chat/polls";
import { formatTime } from "@/lib/format";
import { useLiveChat } from "./use-live-chat";
import { useReplayChat } from "./use-replay-chat";
import { ChatSearch } from "./ChatSearch";
import { ChatBadge } from "./ChatBadge";
import { ChatPoll } from "./ChatPoll";
import { useChatPoll, useNow } from "./use-chat-poll";

export function ChatPanel({ channel, vodId, time = 0, playbackSeekVersion = 0, recordingStartedAt, idle = false, onSeek, onClose }: {
  channel: string;
  vodId?: string;
  time?: number;
  playbackSeekVersion?: number;
  /** When the recording began, for a broadcast still on air. Places its live polls on the replay. */
  recordingStartedAt?: string;
  /** Holds the panel's frame without connecting to anything. */
  idle?: boolean;
  onClose: () => void;
  onSeek?: (time: number) => void;
}) {
  const [mode, setMode] = useState<"replay" | "live">(vodId ? "replay" : "live");
  const [tool, setTool] = useState<"search" | "reactions" | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const reactionsTrigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="still-chat" aria-label={mode === "replay" ? "Chat replay" : "Live chat"}
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
      <div className="still-chat-heading">
        {vodId ? <div className="still-chat-modes" aria-label="Chat source">
          <button type="button" aria-pressed={mode === "replay"} onClick={() => { setMode("replay"); setTool(null); }}>Replay</button>
          <button type="button" aria-pressed={mode === "live"} onClick={() => { setMode("live"); setTool(null); }}>Live chat</button>
        </div> : <h2 className="text-sm font-medium">Live chat</h2>}
        <div className="still-chat-actions">
          {mode === "replay" && onSeek && <>
            <IconButton ref={searchTrigger} label="Search chat" aria-pressed={tool === "search"} onClick={() => setTool(tool === "search" ? null : "search")} size="sm"><MagnifyingGlass size={17} /></IconButton>
            <IconButton ref={reactionsTrigger} label="Audience reactions" aria-pressed={tool === "reactions"} onClick={() => setTool(tool === "reactions" ? null : "reactions")} size="sm"><ChartBar size={17} /></IconButton>
          </>}
        </div>
      </div>
      {idle ? <div className="still-chat-content" />
        : mode === "replay" && vodId
        ? <ReplayChat key={vodId} channel={channel} vodId={vodId} recordingStartedAt={recordingStartedAt} time={time} playbackSeekVersion={playbackSeekVersion} onSeek={onSeek} tool={tool} />
        : <LiveChat key={channel} channel={channel} />}
    </section>
  );
}

function LiveChat({ channel }: { channel: string }) {
  const { messages, status } = useLiveChat(channel);
  return <ChatMessages pinned={<LivePoll channel={channel} />} messages={messages} empty={status === "Connected" ? "No messages yet. New messages will appear here." : status} />;
}

function LivePoll({ channel }: { channel: string }) {
  const { history, skew } = useChatPoll(channel);
  const now = useNow(history.length > 0);
  // The newest report can be stamped a moment ahead of the ticking clock.
  const at = Math.max(now - skew, history.at(-1)?.at ?? 0);
  return <ChatPoll poll={pollAt(history, at)} at={at} />;
}

function ReplayChat({ channel, vodId, recordingStartedAt, time, playbackSeekVersion, onSeek, tool }: { channel: string; vodId: string; recordingStartedAt?: string; time: number; playbackSeekVersion: number; onSeek?: (time: number) => void; tool: "search" | "reactions" | null }) {
  const { messages, status, error, seekVersion, resync } = useReplayChat(vodId, time, playbackSeekVersion);
  // Twitch keeps no poll history for viewers, so a replay can only show polls seen while the broadcast is on air.
  const startedAt = recordingStartedAt ? Date.parse(recordingStartedAt) : NaN;
  const { history } = useChatPoll(channel, Number.isFinite(startedAt));
  const at = startedAt + time * 1000;
  const poll = Number.isFinite(startedAt) ? <ChatPoll poll={pollAt(history, at)} at={at} /> : undefined;
  return <>
    {tool && onSeek ? <ChatSearch vodId={vodId} time={time} onSeek={onSeek} view={tool} /> : <ChatMessages pinned={poll} onSeek={onSeek} resetKey={seekVersion} messages={messages} empty={error || (status === "Loading replay…" ? status : "No messages at this point in the video.")} error={error} onRetry={resync} onJumpToLatest={resync} />}
    <div className="still-chat-footer"><span role="status">{status}</span><time className="font-mono">{formatTime(time)}</time></div>
  </>;
}

function ChatMessages({ messages, empty, error, onRetry, onJumpToLatest, onSeek, pinned, resetKey = 0 }: {
  /** Held above the messages, outside their scroll. */
  pinned?: ReactNode;
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
  // Source-supplied colors are data. Typography, layout and the null-color fallback live in still.css.
  const colors = [...new Set(messages.map(message => sanitizeChatColor(message.color)).filter(Boolean))];
  const colorRules = colors.map(color => `.still-chat-user[data-color="${color}"]{color:${color}}`).join("\n");
  // Restore follow before the replacement buffer can emit scroll events.
  useLayoutEffect(() => {
    followingRef.current = true;
    setFollowing(true);
  }, [resetKey]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && followingRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);
  // Something pinned above takes its height from the top of the list. Keep the messages where they are.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    let height = list.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = list.clientHeight;
      list.scrollTop = followingRef.current ? list.scrollHeight : list.scrollTop + height - next;
      height = next;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return <div className="still-chat-content">
    <style>{colorRules}</style>
    {pinned}
    <div ref={listRef} className="still-chat-messages" aria-label="Chat messages" onScroll={() => {
      const list = listRef.current;
      if (!list) return;
      const pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      followingRef.current = pinned;
      setFollowing(pinned);
    }}>
      {messages.length ? messages.map((message) => <p key={message.id} className="still-chat-message">
        {message.offset !== undefined && <button type="button" className="still-chat-timestamp" disabled={!onSeek} onClick={() => onSeek?.(message.offset!)} aria-label={`Seek to ${formatTime(message.offset)}`}>{formatTime(message.offset)}</button>}
        {message.badges?.map(badge => badge.imageUrl ? <ChatBadge key={`${badge.id}:${badge.version}`} imageUrl={badge.imageUrl} title={badge.title} /> : null)}
        <span className="still-chat-user" data-color={sanitizeChatColor(message.color) || undefined}>{message.user}</span>{": "}{message.fragments ? message.fragments.map((fragment, index) => <ChatFragment key={index} fragment={fragment} />) : message.text}
      </p>) : <div className="still-chat-empty"><p role={error ? "alert" : "status"}>{empty}</p>{error && <ReplayRetry onRetry={onRetry} />}</div>}
      {error && messages.length > 0 && <div className="p-3 text-xs text-text-tertiary"><p role="alert">{error}</p><ReplayRetry onRetry={onRetry} /></div>}
    </div>
    {!following && <button type="button" className="still-chat-follow" onClick={() => {
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
