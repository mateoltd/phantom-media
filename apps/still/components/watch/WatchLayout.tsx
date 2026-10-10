"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** Matches the width in still.css from which chat sits beside the video. */
const BESIDE_VIDEO = "(min-width: 1400px)";
function subscribeBesideVideo(notify: () => void) {
  const query = window.matchMedia(BESIDE_VIDEO);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export interface WatchChat {
  open: boolean;
  /** "auto" leaves the choice to the stylesheet, so the served page is already laid out for its width. */
  state: "auto" | "true" | "false";
  /** False until chat has been shown once. Nothing connects for a panel nobody has seen. */
  started: boolean;
  toggle: () => void;
  close: () => void;
}

/** Chat starts open only where it fits beside the video. Below that width the video takes the page and chat waits to be asked for. */
export function useWatchChat(automatic = true): WatchChat {
  const [choice, setChoice] = useState<boolean | null>(automatic ? null : false);
  const beside = useSyncExternalStore(subscribeBesideVideo, () => window.matchMedia(BESIDE_VIDEO).matches, () => null);
  const [started, setStarted] = useState(false);
  if ((choice ?? beside) && !started) setStarted(true);
  return {
    // The server cannot know the width: it renders the panel, and the stylesheet keeps it shut where it does not fit.
    open: choice ?? beside ?? true,
    state: choice === null ? "auto" : choice ? "true" : "false",
    started,
    toggle: () => setChoice(!(choice ?? beside ?? false)),
    close: () => setChoice(false),
  };
}

/** Keep the video mounted while the shared action/chat sidebar changes width. */
export function WatchLayout({ video, chat, chatOpen, chatState = chatOpen ? "true" : "false", rail, children }: {
  video: ReactNode;
  chat?: ReactNode;
  chatOpen: boolean;
  chatState?: WatchChat["state"];
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
    <div className="still-playback-layout" data-chat-open={chatState}>
      <div className="still-playback-video">{video}</div>
      <aside className="still-watch-sidebar" aria-label="Channel and chat" ref={sidebarRef}>
        <div id="watch-chat" className="still-sidebar-chat" inert={!chatOpen} aria-hidden={!chatOpen}>
          <div className="still-sidebar-chat-inner t-panel-slide" data-open={chatState}>
            {(chatOpen || retained) && chat}
          </div>
        </div>
        {rail}
      </aside>
      <div className="still-playback-details">{children}</div>
    </div>
  </div>;
}
