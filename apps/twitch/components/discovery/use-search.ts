"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SearchSuggestion } from "@phantom/ui";
import { extractChannelName, extractClipSlug, extractVodId } from "@/lib/validation";
import { formatTime } from "@/lib/format";
import { localChannelSearch, prepareSearchResults, refreshChannelSearch, searchMatchDeadline, searchRevision, serverSearchRevision, subscribeSearch, warmSearch } from "@/lib/search/client";
import { searchAvatarURL } from "@/lib/search/avatars";
import { SEARCH_OBSERVATION_TTL, SEARCH_POPULARITY_TTL } from "@/lib/search/ranking";

export function useSearch(value: string, active: boolean) {
  const query = value.trim(), clip = extractClipSlug(query), vod = extractVodId(query);
  const login = extractChannelName(query);
  const explicit = query.startsWith("@") || /^https?:\/\//i.test(query);
  const term = login ? `${explicit ? "@" : ""}${login}` : query.toLowerCase();
  const revision = useSyncExternalStore(subscribeSearch, searchRevision, serverSearchRevision);
  const [response, setResponse] = useState<{ query: string; suggestions?: SearchSuggestion[]; error?: string }>();
  const [clock, setClock] = useState(0);
  const searchable = query.length >= 2 && query.length <= 80 && !clip;
  const enabled = active && searchable;
  useEffect(() => { void warmSearch(); }, []);
  useEffect(() => { if (enabled && !vod) void prepareSearchResults(term); }, [enabled, vod, term, revision, clock]);
  useEffect(() => {
    if (!enabled || vod) return;
    const expires = localChannelSearch(term).flatMap(channel => [
      ...(channel.observedAt && channel.isLive !== undefined ? [channel.observedAt + SEARCH_OBSERVATION_TTL] : []),
      ...(channel.verifiedObservedAt && channel.isVerified !== undefined ? [channel.verifiedObservedAt + SEARCH_OBSERVATION_TTL] : []),
      ...(channel.popularityObservedAt && (channel.followerCount !== undefined || channel.isPartner !== undefined) ? [channel.popularityObservedAt + SEARCH_POPULARITY_TTL] : []),
    ]);
    const matchDeadline = searchMatchDeadline(term);
    if (matchDeadline) expires.push(matchDeadline);
    if (!expires.length) return;
    const timer = window.setTimeout(() => setClock(value => value + 1), Math.max(1, Math.min(...expires) - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [enabled, term, vod, revision, clock]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    if (!vod) {
      void warmSearch();
      let settled = 0;
      const failures: unknown[] = [];
      const count = explicit ? 1 : 2;
      const finish = (error?: unknown) => {
        if (error) failures.push(error);
        settled++;
        if (controller.signal.aborted) return;
        const hasResults = localChannelSearch(term).length > 0;
        if (hasResults || settled === count) setResponse({ query,
          error: !hasResults && failures.length > 0 ? (failures[0] instanceof Error ? failures[0].message : "Search unavailable. Try again.") : undefined });
      };
      const quick = window.setTimeout(() => {
        void refreshChannelSearch(term, controller.signal).then(() => finish(), finish);
      }, 30);
      const expand = !explicit ? window.setTimeout(() => {
        void refreshChannelSearch(term, controller.signal, true).then(() => finish(), finish);
      }, 250) : undefined;
      return () => { clearTimeout(quick); if (expand !== undefined) clearTimeout(expand); controller.abort(); };
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/vod/metadata?vodId=${encodeURIComponent(vod)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Video couldn’t be loaded.");
        if (!controller.signal.aborted) setResponse({ query, suggestions: [{ id: `vod:${vod}`, title: data.title || `Video ${vod}`, subtitle: data.channel,
          imageUrl: data.previewThumbnailURL, thumbnail: "video", meta: "VOD", badge: data.lengthSeconds ? formatTime(data.lengthSeconds) : undefined }] });
      } catch (error) {
        if (!controller.signal.aborted) setResponse({ query, error: error instanceof Error ? error.message : "Search unavailable. Try again." });
      }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, term, vod, enabled, explicit]);
  const suggestions = useMemo<SearchSuggestion[]>(() => {
    // The external index mutates independently of this input's React state.
    void revision;
    void clock;
    // Retain hidden matches for SearchField's Escape/ArrowDown and Enter flow.
    // Reopening also reprojects freshness, while requests/timers stay active-only.
    void active;
    if (!searchable) return [];
    if (vod) return response?.query === query ? response.suggestions ?? [] : [];
    return localChannelSearch(term).map(channel => ({ id: channel.login, title: channel.displayName,
      subtitle: channel.isLive ? channel.title || `@${channel.login}` : `@${channel.login}`,
      meta: channel.isLive ? `Live${channel.viewersCount ? `, ${channel.viewersCount.toLocaleString()}` : ""}` : channel.isLive === false ? "Offline" : undefined,
      status: channel.isLive ? "live" : channel.isLive === false ? "offline" : undefined, imageUrl: searchAvatarURL(channel.profileImageURL), thumbnail: "avatar", verified: channel.isVerified ?? channel.isPartner === true }));
  }, [searchable, active, vod, response, query, term, revision, clock]);
  const lookupPending = searchable && response?.query !== query && !suggestions.length;
  return { suggestions, lookupPending, searching: enabled && lookupPending,
    error: response?.query === query ? response.error : undefined };
}
