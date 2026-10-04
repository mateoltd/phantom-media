"use client";

import { useEffect, ViewTransition } from "react";
import { useRouter } from "next/navigation";
import { recentChannelLogins } from "@/lib/discovery";
import { buildVodPath } from "@/lib/validation";
import { ChannelDiscovery } from "./ChannelDiscovery";
import { useHistory, useHistoryRead } from "./History";

/**
 * The home page. It reads nothing from the URL, so it is part of the page's static HTML: the search and the
 * skeletons are the first paint, not something a script adds after it.
 */
export function HomeView() {
  const router = useRouter();
  const history = useHistory();
  const read = useHistoryRead();

  // Keeps what lib/history-hint.ts wrote on <html> true once the history is known here.
  useEffect(() => {
    if (!read) return;
    const page = document.documentElement.dataset;
    if (history.length === 0) { delete page.history; delete page.historyChannels; return; }
    page.history = String(Math.min(history.length, 4));
    page.historyChannels = String(recentChannelLogins(history).length);
  }, [history, read]);

  // The page dissolves around its search, which makes its own way to the header (see HomeSearch).
  return (
    <ViewTransition enter="twitch-page" exit="twitch-page" default="none">
      <main className="workspace-canvas twitch-main relative">
        <div className="twitch-home" data-has-history={history.length > 0}>
          <div className="twitch-home-bottom">
            <ChannelDiscovery entries={history} pending={!read} onVideo={(vodId) => router.push(buildVodPath(vodId))} />
          </div>
        </div>
      </main>
    </ViewTransition>
  );
}
