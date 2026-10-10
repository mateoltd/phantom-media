"use client";

import { useEffect, ViewTransition } from "react";
import { useRouter } from "next/navigation";
import { recentChannelLogins } from "@/lib/discovery/ranking";
import { discoveryHistory } from "@/lib/history";
import { ChannelDiscovery } from "./ChannelDiscovery";
import { useHistory, useHistoryRead } from "../history/use-history";

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
    page.historyChannels = String(recentChannelLogins(discoveryHistory(history)).length);
  }, [history, read]);

  // The page dissolves around its search, which makes its own way to the header (see HomeSearch).
  return (
    <ViewTransition enter="still-page" exit="still-page" default="none">
      <main className="workspace-canvas still-main relative">
        <div className="still-home" data-has-history={history.length > 0}>
          <div className="still-home-bottom">
            <ChannelDiscovery entries={history} pending={!read} onNavigate={(path) => router.push(path)} />
          </div>
        </div>
      </main>
    </ViewTransition>
  );
}
