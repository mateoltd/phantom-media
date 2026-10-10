"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep the video mounted while the shared action/chat sidebar changes width. */
export function WatchLayout({ video, chat, chatOpen, rail, children }: {
  video: ReactNode;
  chat?: ReactNode;
  chatOpen: boolean;
  rail: ReactNode;
  children: ReactNode;
}) {
  const [retained, setRetained] = useState(chatOpen);
  const sidebarRef = useRef<HTMLElement>(null);
  if (chatOpen && !retained) setRetained(true);

  useEffect(() => {
    if (chatOpen || !retained) return;
    const panel = sidebarRef.current;
    const duration = panel ? parseFloat(getComputedStyle(panel).getPropertyValue("--panel-close-dur")) : 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRetained(false), reduced ? 0 : duration);
    return () => window.clearTimeout(timer);
  }, [chatOpen, retained]);

  return <div className="still-watch-viewport">
    <div className="still-playback-layout" data-chat-open={chatOpen}>
      <div className="still-playback-video">{video}</div>
      <aside className="still-watch-sidebar" aria-label="Channel and chat" ref={sidebarRef}>
        <div id="watch-chat" className="still-sidebar-chat" inert={!chatOpen} aria-hidden={!chatOpen}>
          <div className="still-sidebar-chat-inner t-panel-slide" data-open={chatOpen}>
            {(chatOpen || retained) && chat}
          </div>
        </div>
        {rail}
      </aside>
      <div className="still-playback-details">{children}</div>
    </div>
  </div>;
}
