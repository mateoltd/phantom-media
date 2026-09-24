"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/ssr";
import { IconButton } from "@phantom/ui";
import { recentChannelLogins, type ChannelDiscoveryData, type DiscoveryChannel } from "@/lib/discovery";
import type { HistoryEntry } from "./History";
import { HomeTileSkeleton, RecommendedTile, ResumeTile } from "./HomeMediaTile";
import { ChannelRail } from "./ChannelRail";
import { isCurrentBroadcast, uniqueChannels, watchFeed } from "@/lib/home-feed";

type LoadError = { message: string; retryAt: number; terminal?: boolean };
async function discoveryResponse(response: Response) {
  if (!response.ok) {
    const delay = Number(response.headers.get("Retry-After"));
    throw { message: response.status === 429 ? "Taking a short break. More streams will be available shortly." : "More streams couldn’t be loaded.",
      retryAt: Date.now() + (Number.isFinite(delay) && delay > 0 ? delay : 15) * 1000, terminal: response.status === 403 } satisfies LoadError;
  }
  return response.json();
}

export function ChannelDiscovery({ entries, onVideo, footer }: { entries: HistoryEntry[]; onVideo: (vodId: string) => void; footer?: ReactNode }) {
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
  return <Feed key={result?.request || "loading"} entries={entries} onVideo={onVideo} data={result?.data} loading={loading} refresh={refreshFeed} error={error} footer={footer} />;
}

function Feed({ entries, onVideo, data, loading, refresh, error, footer }: {
  entries: HistoryEntry[]; onVideo: (id: string) => void; data?: ChannelDiscoveryData; loading: boolean; refresh: () => void; error: LoadError | null; footer?: ReactNode;
}) {
  const [pool, setPool] = useState(() => uniqueChannels(data?.sections.flatMap((section) => section.channels) ?? []));
  const [next, setNext] = useState(data?.next);
  const [visible, setVisible] = useState(6);
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState<LoadError | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const lastRequest = useRef(0);
  const recent = recentChannelLogins(entries).map((login) => data?.recent.find((channel) => channel.login.toLowerCase() === login) ?? { id: login, login, displayName: login });
  const activeHistory = new Set(entries.filter((entry) => isCurrentBroadcast(entry, recent.find((channel) => channel.login.toLowerCase() === entry.channel.toLowerCase()))).map((entry) => entry.channel.toLowerCase()));
  const suggestions = pool.filter((channel) => channel.stream && !activeHistory.has(channel.login.toLowerCase()));
  const feed = watchFeed(entries, suggestions);
  const hasMore = visible < feed.length || Boolean(next);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || loading || !data || moreError || !hasMore) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || inFlight.current) return;
      observer.disconnect();
      if (visible < feed.length) { setVisible((count) => count + 6); return; }
      if (!next) return;
      inFlight.current = true;
      setFetching(true);
      // Cached candidates are exhausted. Serialize remote expansion, with a minimum gap.
      timer = setTimeout(async () => {
        lastRequest.current = Date.now();
        try {
          const query = new URLSearchParams({ cursor: next.cursor, languages: next.languages.join(",") });
          const response = await fetch(`/api/channel/discovery/more?${query}`, { signal: controller.signal, cache: "no-store" });
          const page: { channels: DiscoveryChannel[]; next?: ChannelDiscoveryData["next"] } = await discoveryResponse(response);
          if (controller.signal.aborted) return;
          setPool((channels) => uniqueChannels([...channels, ...page.channels]));
          setNext(page.next?.cursor === next.cursor ? undefined : page.next);
          setVisible((count) => count + 6);
        } catch (reason) {
          if (!controller.signal.aborted) setMoreError({ message: "More streams couldn’t be loaded.", retryAt: Date.now() + 15000, ...(reason as Partial<LoadError>) });
        } finally {
          inFlight.current = false;
          if (!controller.signal.aborted) setFetching(false);
        }
      }, Math.max(0, 2000 - (Date.now() - lastRequest.current)));
    }, { rootMargin: "100px 0px" });
    observer.observe(target);
    return () => { observer.disconnect(); controller.abort(); clearTimeout(timer); inFlight.current = false; };
  }, [data, feed.length, hasMore, loading, moreError, next, visible]);

  return <div className="app-shell twitch-home-layout">
    <ChannelRail recent={recent} suggestions={pool} loading={loading && !data} />
    <section className="twitch-home-feed" aria-labelledby="home-feed-heading">
      <div className="twitch-home-feed-heading">
        <h1 id="home-feed-heading">{entries.length ? "Your next watch" : "Find your next stream"}</h1>
        <IconButton label="Refresh streams" disabled={loading || fetching || Boolean(error)} onClick={refresh}><ArrowClockwise size={18} /></IconButton>
      </div>
      <div className="twitch-home-media-grid" aria-busy={loading || fetching}>
        {(data || error ? feed.slice(0, visible) : []).map((item) => item.kind === "history"
          ? <ResumeTile key={`video:${item.entry.vodId}`} entry={item.entry} channel={recent.find((channel) => channel.login.toLowerCase() === item.entry.channel.toLowerCase())} onSelect={onVideo} />
          : <RecommendedTile key={`channel:${item.channel.login}`} channel={item.channel} />)}
        {((loading && !data) || fetching) && Array.from({ length: fetching ? 3 : 6 }, (_, index) => <HomeTileSkeleton key={`loading:${index}`} />)}
      </div>
      <div ref={sentinel} className="twitch-home-feed-end">
        {(loading || fetching) && <span className="sr-only" role="status">Loading streams</span>}
        {error ? <RetryNotice key={error.retryAt} error={error} retry={refresh} /> : moreError ? <RetryNotice key={moreError.retryAt} error={moreError} retry={() => setMoreError(null)} />
          : !loading && !hasMore && <p role="status">{feed.length ? "You’re all caught up." : "No streams available right now."}</p>}
      </div>
    </section>
    {footer}
  </div>;
}

function RetryNotice({ error, retry }: { error: LoadError; retry: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), Math.max(0, error.retryAt - Date.now())); return () => clearTimeout(timer); }, [error.retryAt]);
  return <p role="status">{error.message} {!error.terminal && <button type="button" disabled={!ready} onClick={retry}>Try again</button>}</p>;
}
