"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClockCounterClockwise, X } from "@phosphor-icons/react/ssr";
import { IconButton } from "@phantom/ui";
import { recentChannelLogins, type ChannelDiscoveryData, type DiscoveryChannel } from "@/lib/discovery/ranking";
import { discoveryHistory, resourceKey } from "@/lib/history";
import { useHistoryEditor } from "./use-history";
import { ResumeTile } from "../discovery/HomeMediaTile";
import { Footer } from "../Footer";

export function WatchHistory() {
  const router = useRouter();
  const { history, remove, clear } = useHistoryEditor();
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [channels, setChannels] = useState<DiscoveryChannel[]>([]);
  const channelKey = recentChannelLogins(discoveryHistory(history)).join(",");

  useEffect(() => setReady(true), []);

  // Avatars and live state are cosmetic here, so a failed lookup leaves the list as it is.
  useEffect(() => {
    if (!channelKey) return;
    const controller = new AbortController();
    fetch("/api/channel/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: channelKey.split(",") }), signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: ChannelDiscoveryData | null) => { if (data) setChannels(data.recent); })
      .catch(() => {});
    return () => controller.abort();
  }, [channelKey]);

  return <div className="twitch-home twitch-home-bottom">
    <section className="media-content twitch-page" aria-labelledby="history-heading">
      <div className="twitch-home-feed-heading twitch-history-heading">
        <div>
          <h1 id="history-heading">Watch history</h1>
          <p className="twitch-history-note">Saved in this browser only.</p>
        </div>
        {history.length > 0 && (confirming
          ? <div className="twitch-history-confirm" role="group" aria-label="Clear watch history and resume positions?">
            <button type="button" className="twitch-history-clear" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="twitch-history-clear" data-danger onClick={() => { clear(); setConfirming(false); }} autoFocus>Clear all history</button>
          </div>
          : <button type="button" className="twitch-history-clear" onClick={() => setConfirming(true)}>Clear all</button>)}
      </div>
      {!ready ? null : history.length ? <div className="twitch-home-media-grid twitch-history-grid">
        {history.map((entry) => <div key={resourceKey(entry.resource)} className="twitch-history-item">
          <ResumeTile entry={entry} channel={channels.find((channel) => channel.login.toLowerCase() === entry.channel.toLowerCase())} onSelect={(path) => router.push(path)} />
          <IconButton size="sm" className="twitch-history-remove" label={`Remove ${entry.title || entry.channel} from history`} onClick={() => remove(resourceKey(entry.resource))}><X size={16} /></IconButton>
        </div>)}
      </div> : <div className="twitch-history-empty">
        <ClockCounterClockwise size={36} aria-hidden="true" />
        <h2>Nothing watched yet</h2>
        <p>Videos you open here are kept in this browser so you can pick up where you left off.</p>
        <Link href="/" className="cinema-button">Find something to watch</Link>
      </div>}
      <Footer />
    </section>
  </div>;
}
