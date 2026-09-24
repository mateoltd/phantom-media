import type { ReactNode } from "react";

/** Keep the video mounted when chat opens, closes, or changes sources. */
export function WatchLayout({ video, chat, chatOpen, children }: { video: ReactNode; chat?: ReactNode; chatOpen: boolean; children: ReactNode }) {
  return <div className="twitch-playback-layout" data-chat-open={chatOpen}>
    <div className="twitch-playback-video">{video}</div>
    <div className="twitch-playback-details">{children}</div>
    {chatOpen && <div className="twitch-playback-chat">{chat}</div>}
  </div>;
}
