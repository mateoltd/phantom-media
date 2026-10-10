"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/chat/messages";
import { createLiveChatSession } from "@/lib/chat/irc";

export function useLiveChat(channel: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [retry, setRetry] = useState(0);
  useEffect(() => createLiveChatSession({ channel, updateMessages: setMessages, onStatus: setStatus }), [channel, retry]);
  return { messages, status, retry: () => setRetry((value) => value + 1) };
}
