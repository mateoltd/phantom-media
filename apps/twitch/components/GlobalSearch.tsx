"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import { MediaHeader, SearchField, Wordmark, type SearchSuggestion } from "@phantom/ui";
import { buildChannelPath, buildVodPath, extractChannelName, extractVodId } from "@/lib/validation";
import { formatTime } from "@/lib/format";

interface SearchResult {
  login: string;
  displayName: string;
  profileImageURL: string;
  isLive: boolean;
  title?: string;
  viewersCount?: number;
}

export function GlobalSearch() {
  const pathname = usePathname();
  return <MediaHeader
    key={pathname}
    routeKey={pathname}
    floating={false}
    brand={<Link href="/" aria-label="Phantom Twitch home">
      <Wordmark service="Twitch" tone="chalk" className="hidden sm:flex" />
      <Wordmark tone="chalk" className="sm:hidden" />
    </Link>}
    search={<TwitchSearch key={pathname} />}
    actions={<Link href="/watch-history" className="media-header-action" aria-label="Watch history" title="Watch history" aria-current={pathname === "/watch-history" ? "page" : undefined}>
      <ClockCounterClockwise weight={pathname === "/watch-history" ? "bold" : "regular"} size={20} aria-hidden="true" />
    </Link>}
  />;
}

function TwitchSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef(new Map<string, { time: number; suggestions: SearchSuggestion[] }>());
  const query = value.trim();

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const vodId = extractVodId(query);
    const term = extractChannelName(query) ?? query.toLowerCase();
    const key = vodId ? `vod:${vodId}` : term;
    const timer = window.setTimeout(async () => {
      const cached = cacheRef.current.get(key);
      if (cached && Date.now() - cached.time < 60_000) {
        setSuggestions(cached.suggestions);
        setSearching(false);
        return;
      }
      try {
        const response = await fetch(vodId
          ? `/api/vod/metadata?vodId=${encodeURIComponent(vodId)}`
          : `/api/channel/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search unavailable. Try again.");
        if (controller.signal.aborted) return;
        const found: SearchSuggestion[] = vodId ? [{
          id: `vod:${vodId}`, title: data.title || `Video ${vodId}`, subtitle: data.channel,
          imageUrl: data.previewThumbnailURL, thumbnail: "video", meta: "VOD",
          badge: data.lengthSeconds ? formatTime(data.lengthSeconds) : undefined,
        }] : (data.results as SearchResult[]).map((result) => ({
          id: result.login, title: result.displayName,
          subtitle: result.isLive ? result.title || `@${result.login}` : `@${result.login}`,
          meta: result.isLive ? `Live${result.viewersCount ? `, ${result.viewersCount.toLocaleString()}` : ""}` : "Offline",
          status: result.isLive ? "live" : "offline", imageUrl: result.profileImageURL, thumbnail: "avatar",
        }));
        cacheRef.current.set(key, { time: Date.now(), suggestions: found });
        setSuggestions(found);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const submit = (input: string) => {
    const video = extractVodId(input);
    if (video) return router.push(buildVodPath(video));
    const channel = extractChannelName(input);
    if (channel) return router.push(buildChannelPath(channel));
    setError("Enter a Twitch channel, video ID, or Twitch URL.");
    setOpen(true);
  };

  return <SearchField
    inputId="global-search-input"
    value={value}
    onValueChange={(next) => {
      setValue(next); setError(""); setSuggestions([]);
      setSearching(next.trim().length >= 2); setOpen(true);
    }}
    onSubmit={submit}
    labels={{ placeholder: "Channel or Twitch video link", submit: "Open Twitch content", working: "Searching", suggestions: "Channels and videos", looking: "Searching Twitch…", paste: "Paste from clipboard", empty: error || "No channels found" }}
    suggestions={suggestions}
    suggestionsOpen={open && query.length >= 2}
    suggestionsLoading={searching}
    onSuggestionsOpenChange={setOpen}
    onSuggestionSelect={(item) => {
      if (item.id.startsWith("vod:")) router.push(buildVodPath(item.id.slice(4)));
      else router.push(buildChannelPath(item.id));
    }}
    size="compact"
  />;
}
