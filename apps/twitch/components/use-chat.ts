"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chatColor, mergeReplayMessages, messagesAtTime, parseChatLine, type ChatMessage } from "@/lib/chat";

export function useLiveChat(channel: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!/^[a-z0-9_]{3,25}$/i.test(channel)) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let pending: ChatMessage[] = [];
    const seen = new Set<string>();
    const flush = window.setInterval(() => {
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      setMessages((current) => [...current, ...batch].slice(-500));
    }, 200);

    function connect() {
      if (stopped) return;
      setStatus(attempts ? "Reconnecting…" : "Connecting…");
      const connection = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
      socket = connection;
      connection.onopen = () => {
        if (stopped || socket !== connection) return;
        // https://dev.twitch.tv/docs/chat/irc/ (read-only anonymous connection)
        connection.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        connection.send("PASS SCHMOOPIIE");
        connection.send(`NICK justinfan${Math.floor(100000 + Math.random() * 900000)}`);
        connection.send(`JOIN #${channel.toLowerCase()}`);
      };
      connection.onmessage = (event) => {
        if (stopped || socket !== connection || typeof event.data !== "string") return;
        for (const line of event.data.split("\r\n")) {
          if (line.startsWith("PING ")) {
            connection.send(line.replace(/^PING/, "PONG"));
            continue;
          }
          if (line.includes(" RECONNECT")) { connection.close(); continue; }
          if (line.includes(" 366 ") || line.includes(" ROOMSTATE ")) {
            attempts = 0;
            setStatus("Connected");
          }
          if (line.includes(" CLEARMSG ")) {
            const id = line.match(/(?:^@|;)target-msg-id=([^; ]+)/)?.[1];
            if (id) {
              pending = pending.filter((message) => message.id !== id);
              setMessages((current) => current.filter((message) => message.id !== id));
            }
            continue;
          }
          if (line.includes(" CLEARCHAT ")) {
            const user = line.match(/ CLEARCHAT #[^ ]+(?: :(.+))?$/)?.[1]?.trim();
            pending = user ? pending.filter((message) => message.user.toLowerCase() !== user.toLowerCase()) : [];
            setMessages((current) => user ? current.filter((message) => message.user.toLowerCase() !== user.toLowerCase()) : []);
            continue;
          }
          const message = parseChatLine(line);
          if (!message || seen.has(message.id)) continue;
          setStatus("Connected");
          seen.add(message.id);
          if (seen.size > 2000) seen.delete(seen.values().next().value!);
          pending = [...pending, message].slice(-150);
        }
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if (stopped || socket !== connection) return;
        setStatus("Reconnecting…");
        reconnectTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearInterval(flush);
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [channel, retry]);

  return { messages, status, retry: () => setRetry((value) => value + 1) };
}

export function useReplayChat(vodId: string, time: number) {
  const timeRef = useRef(time);
  const [buffer, setBuffer] = useState<ChatMessage[]>([]);
  const [seekVersion, setSeekVersion] = useState(0);
  const [status, setStatus] = useState("Loading replay…");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let generation = 0;
    let busy = false;
    let previousTime = timeRef.current;
    let nextOffset: number | null = null;
    let through = -1;
    let exhausted = false;
    let failed = false;
    let messages: ChatMessage[] = [];

    async function update() {
      const now = Math.max(0, timeRef.current);
      if (now < previousTime - 1 || now > previousTime + 10) {
        generation += 1;
        controller?.abort();
        busy = false;
        nextOffset = null;
        through = -1;
        exhausted = false;
        failed = false;
        messages = [];
        setBuffer([]);
        setSeekVersion((value) => value + 1);
      }
      previousTime = now;
      if (busy || exhausted || failed || through > now + 15) return;
      busy = true;
      const currentGeneration = generation;
      controller = new AbortController();
      const signal = controller.signal;
      const params = new URLSearchParams({ vodId });
      params.set("offset", String(nextOffset ?? Math.max(0, Math.floor(now) - 15)));
      setError("");
      if (!messages.length) setStatus("Loading replay…");
      try {
        const response = await fetch(`/api/vod/comments?${params}`, { signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Chat replay is unavailable");
        if (stopped || signal.aborted || currentGeneration !== generation) return;
        const incoming: ChatMessage[] = data.messages.map((message: ChatMessage) => ({ ...message, color: message.color || chatColor(message.user) }));
        messages = mergeReplayMessages(messages, incoming);
        through = incoming.at(-1)?.offset ?? now;
        exhausted = data.nextOffset === null;
        nextOffset = data.nextOffset;
        setBuffer(messages);
        setStatus("Synced with video");
      } catch (caught) {
        if (stopped || signal.aborted || currentGeneration !== generation) return;
        failed = true;
        setError(caught instanceof Error ? caught.message : "Chat replay is unavailable");
        setStatus("Unavailable");
      } finally {
        if (currentGeneration === generation) busy = false;
      }
    }
    void update();
    const timer = window.setInterval(() => void update(), 250);
    return () => { stopped = true; clearInterval(timer); controller?.abort(); };
  }, [vodId, retry]);

  const messages = useMemo(() => messagesAtTime(buffer, time), [buffer, time]);
  return { messages, status, error, seekVersion, retry: () => setRetry((value) => value + 1) };
}
