"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { messagesAtTime, parseChatLine, type ChatMessage } from "@/lib/chat";
import { createReplayChatSession, type ReplayChatState } from "@/lib/replay-chat";

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
  return { messages, status: state.status, error: state.error, seekVersion, resync: () => setRetry((value) => value + 1) };
}
