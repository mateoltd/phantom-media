"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsClockwise, ChatCircle } from "@phosphor-icons/react/ssr";
import { Button, SearchField } from "@phantom/ui";
import { StillLoader } from "../StillLoader";
import { createChatIndex } from "@/lib/chat/index";
import type { ChatMessage } from "@/lib/chat/messages";
import { formatTime } from "@/lib/format";

export function ChatSearch({ vodId, time, onSeek, view }: {
  vodId: string; time: number; onSeek: (position: number) => void; view: "search" | "reactions";
}) {
  const [index] = useState(() => createChatIndex());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function capture() {
    if (controller.current) return;
    const stop = new AbortController();
    controller.current = stop; setBusy(true); setError("");
    const position = time;
    let offset = Math.max(0, Math.floor(position) - 120);
    try {
      for (let page = 0; page < 6 && offset <= position + 120; page++) {
        const response = await fetch(`/api/vod/comments?vodId=${vodId}&offset=${offset}`, { signal: stop.signal });
        if (!response.ok) throw new Error("Chat could not be loaded. Try again.");
        const data = await response.json() as { messages: ChatMessage[]; nextOffset: number | null; coverage: { from: number; through: number; partial: boolean } };
        if (stop.signal.aborted) return;
        index.add(data.messages, data.coverage); setRevision(value => value + 1);
        if (data.nextOffset === null || data.nextOffset <= offset) break;
        offset = data.nextOffset;
      }
    } catch (error) {
      if (!stop.signal.aborted) setError(error instanceof Error ? error.message : "Chat could not be loaded.");
    } finally {
      if (!stop.signal.aborted) setBusy(false);
      if (controller.current === stop) controller.current = null;
    }
  }

  const results = index.search(query);
  return <div className="still-chat-tools" data-revision={revision}>
    <div className="still-chat-tools-toolbar">
      {view === "search" ? <SearchField autoFocus size="small" showSubmit={false} className="still-chat-search" value={query} onValueChange={setQuery} onSubmit={() => {}} labels={{ placeholder: "Search messages", submit: "Search chat", working: "Searching…", suggestions: "Messages", clear: "Clear chat search", looking: "Searching…" }} /> : <h2>Audience reactions</h2>}
      <Button variant="ghost" className="still-chat-load" disabled={busy} onClick={() => void capture()}><ArrowsClockwise size={15} />{busy ? "Loading messages…" : "Load nearby messages"}</Button>
      {busy && <StillLoader label="Loading nearby messages…" variant="compact" />}
      {index.size() > 0 && <p className="still-chat-sample-note">{index.size()} messages loaded. Results cover the loaded sample.</p>}
      {error && <p role="alert" className="still-chat-sample-note">{error}</p>}
    </div>
    <div className="still-chat-tools-results">
      {!index.size() && !busy && <div className="still-chat-empty"><ChatCircle size={24} /><p>{view === "search" ? "Load nearby messages to search this part of the recording." : "Load nearby messages to find active moments in chat."}</p></div>}
      {view === "search" && results.map(message => <Button variant="ghost" className="still-chat-result" key={message.id} onClick={() => onSeek(message.offset!)}><time>{formatTime(message.offset!)}</time><span><strong>{message.user}</strong> {message.text}</span></Button>)}
      {view === "search" && index.size() > 0 && <p className="still-chat-sample-note" role="status">{!query ? "Search by message or username." : !results.length ? "No matching messages in this sample." : `${results.length} matching messages`}</p>}
      {view === "reactions" && index.reactions().map(bin => <Button variant="ghost" className="still-chat-result still-chat-reaction" key={bin.position} onClick={() => onSeek(bin.position)}><time>{formatTime(bin.position)}</time><span><strong>{bin.count} messages</strong><span>{bin.emotes} emotes</span></span><span className="still-resource-pill still-resource-number">{bin.relative.toFixed(1)}×</span></Button>)}
    </div>
  </div>;
}
