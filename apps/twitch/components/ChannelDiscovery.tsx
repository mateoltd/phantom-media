"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconButton } from "@phantom/ui";
import { ArrowClockwise } from "@phosphor-icons/react/ssr";
import { recentChannelLogins, type ChannelDiscoveryData, type DiscoveryChannel } from "@/lib/discovery";
import type { HistoryEntry } from "./History";
import { HomeAvatar, HomeTileSkeleton, RecommendedTile, ResumeTile } from "./HomeMediaTile";
import { HomeSearch } from "./HomeSearch";
import { isCurrentBroadcast, uniqueChannels } from "@/lib/home-feed";
import { buildChannelPath } from "@/lib/validation";

type LoadError = { message: string; retryAt: number; terminal?: boolean };
async function discoveryResponse(response: Response) {
  if (!response.ok) {
    const delay = Number(response.headers.get("Retry-After"));
    throw { message: response.status === 429 ? "Taking a short break. More streams will be available shortly." : "More streams couldn’t be loaded.",
      retryAt: Date.now() + (Number.isFinite(delay) && delay > 0 ? delay : 15) * 1000, terminal: response.status === 403 } satisfies LoadError;
  }
  return response.json();
}

export function ChannelDiscovery({ entries, onVideo }: { entries: HistoryEntry[]; onVideo: (vodId: string) => void }) {
  const channelKey = recentChannelLogins(entries).join(",");
  const historyKey = JSON.stringify(entries.slice(0, 30).map(({ channel, vodId, timestamp, title }) => ({ channel, vodId, timestamp, title })));
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${channelKey}:${historyKey}:${refresh}`;
  const [result, setResult] = useState<{ request: string; data: ChannelDiscoveryData } | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const loading = !error && result?.request !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/channel/discovery?channels=${encodeURIComponent(channelKey)}&history=${encodeURIComponent(historyKey)}`, { signal: controller.signal, cache: "no-store" })
      .then(discoveryResponse).then((data: ChannelDiscoveryData) => {
        if (!controller.signal.aborted) { setResult({ request: requestKey, data }); setError(null); }
      }).catch((reason) => {
        if (!controller.signal.aborted) setError({ message: "Streams couldn’t be loaded. Your watch history is still here.", retryAt: Date.now() + 15000, ...reason });
      });
    return () => controller.abort();
  }, [channelKey, historyKey, requestKey]);

  function refreshFeed() { setError(null); setRefresh((value) => value + 1); }
  return <Feed key={result?.request || "loading"} entries={entries} onVideo={onVideo} data={result?.data} loading={loading} refresh={refreshFeed} error={error} />;
}

const PAGE = 12;

function Feed({ entries, onVideo, data, loading, refresh, error }: {
  entries: HistoryEntry[]; onVideo: (id: string) => void; data?: ChannelDiscoveryData; loading: boolean; refresh: () => void; error: LoadError | null;
}) {
  const [pool, setPool] = useState(() => uniqueChannels(data?.sections.flatMap((section) => section.channels) ?? []));
  const [next, setNext] = useState(data?.next);
  const [visible, setVisible] = useState(PAGE);
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState<LoadError | null>(null);
  const recent = recentChannelLogins(entries).map((login) => data?.recent.find((channel) => channel.login.toLowerCase() === login) ?? { id: login, login, displayName: login });
  // Live channels first: the row answers "is anyone I watch on right now" before anything else.
  const yours = [...recent.filter((channel) => channel.stream), ...recent.filter((channel) => !channel.stream)];
  const activeHistory = new Set(entries.filter((entry) => isCurrentBroadcast(entry, recent.find((channel) => channel.login.toLowerCase() === entry.channel.toLowerCase()))).map((entry) => entry.channel.toLowerCase()));
  const live = pool.filter((channel) => channel.stream && !activeHistory.has(channel.login.toLowerCase()));
  const resume = entries.slice(0, 4);
  const waiting = loading && !data;
  const hasMore = visible < live.length || Boolean(next);

  async function showMore() {
    setMoreError(null);
    // Show what is already here before asking Twitch for another page.
    if (visible < live.length || !next) { setVisible((count) => count + PAGE); return; }
    setFetching(true);
    try {
      const query = new URLSearchParams({ cursor: next.cursor, languages: next.languages.join(",") });
      const page: { channels: DiscoveryChannel[]; next?: ChannelDiscoveryData["next"] } = await discoveryResponse(await fetch(`/api/channel/discovery/more?${query}`, { cache: "no-store" }));
      setPool((channels) => uniqueChannels([...channels, ...page.channels]));
      setNext(page.next?.cursor === next.cursor ? undefined : page.next);
      setVisible((count) => count + PAGE);
    } catch (reason) {
      setMoreError({ message: "More streams couldn’t be loaded.", retryAt: Date.now() + 15000, ...(reason as Partial<LoadError>) });
    } finally {
      setFetching(false);
    }
  }

  return <div className="twitch-home-layout">
    <section className="twitch-home-hero" aria-labelledby="home-search-heading">
      <h2 id="home-search-heading" className="twitch-home-prompt"><label htmlFor="home-search-input">What do you want to watch?</label></h2>
      <HomeSearch />
      {yours.length > 0 && <nav className="twitch-channels" aria-label="Channels you have watched">
        {yours.map((channel) => {
          const status = channel.stream ? `live${channel.stream.game?.name ? `, ${channel.stream.game.name}` : ""}` : channel.stream === null ? "offline" : "recently watched";
          return <Link key={channel.login} href={buildChannelPath(channel.login)} className="twitch-channel" data-live={channel.stream ? "" : undefined} aria-label={`${channel.displayName}, ${status}`} title={`${channel.displayName}: ${status}`}>
            <HomeAvatar channel={channel} />
            {channel.displayName}
            {channel.stream && <span className="twitch-channel-live" aria-hidden="true" />}
          </Link>;
        })}
      </nav>}
    </section>
    {resume.length > 0 && <section className="twitch-home-section" aria-labelledby="home-resume-heading">
      <div className="twitch-home-feed-heading"><h2 id="home-resume-heading">Continue watching</h2></div>
      <div className="twitch-home-media-grid twitch-home-resume-grid">
        {resume.map((entry) => <ResumeTile key={entry.vodId} entry={entry} channel={recent.find((channel) => channel.login.toLowerCase() === entry.channel.toLowerCase())} onSelect={onVideo} compact />)}
      </div>
    </section>}
    <section className="twitch-home-section" aria-labelledby="home-feed-heading" aria-busy={loading || fetching}>
      <div className="twitch-home-feed-heading">
        <h2 id="home-feed-heading">Live now</h2>
        <IconButton label="Refresh streams" disabled={loading || fetching || Boolean(error)} onClick={refresh}><ArrowClockwise size={18} /></IconButton>
      </div>
      <div className="twitch-home-media-grid">
        {waiting ? Array.from({ length: PAGE }, (_, index) => <HomeTileSkeleton key={index} />)
          : live.slice(0, visible).map((channel) => <RecommendedTile key={channel.login} channel={channel} />)}
      </div>
      <div className="twitch-home-feed-end">
        {(loading || fetching) && <span className="sr-only" role="status">Loading streams</span>}
        {error ? <RetryNotice key={error.retryAt} error={error} retry={refresh} /> : moreError ? <RetryNotice key={moreError.retryAt} error={moreError} retry={showMore} />
          : !waiting && (live.length === 0 ? <p role="status">No streams available right now.</p>
            : hasMore && <button type="button" className="cinema-button" disabled={fetching} onClick={showMore}>{fetching ? "Loading…" : "Show more"}</button>)}
      </div>
    </section>
  </div>;
}

function RetryNotice({ error, retry }: { error: LoadError; retry: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), Math.max(0, error.retryAt - Date.now())); return () => clearTimeout(timer); }, [error.retryAt]);
  return <p role="status">{error.message} {!error.terminal && <button type="button" disabled={!ready} onClick={retry}>Try again</button>}</p>;
}
