"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchField, type SearchSuggestion } from "@phantom/ui";
import type {
  QueryResult,
  ResolveResponse,
  SearchResponse,
  VideoInfo,
} from "@/lib/types";
import { formatDuration } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import { prefetchStreamOptions } from "@/hooks/use-youtube";

interface SearchBarProps {
  onSubmit: (query: string) => void;
  onSelectVideo?: (video: VideoInfo) => void;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  initialValue?: string;
  size?: "default" | "compact";
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function SearchBar({
  onSubmit,
  onSelectVideo,
  loading = false,
  placeholder,
  autoFocus = false,
  initialValue = "",
  size = "default",
}: SearchBarProps) {
  const { messages: t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const cacheRef = useRef(new Map<string, VideoInfo[]>());
  const skipNextLookupRef = useRef(false);
  const shouldAutoOpenRef = useRef(initialValue === "");
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    if (initialValueRef.current === initialValue) return;
    initialValueRef.current = initialValue;
    shouldAutoOpenRef.current = false;
    skipNextLookupRef.current = true;
    setValue(initialValue);
    setVideos([]);
    setOpen(false);
  }, [initialValue]);

  useEffect(() => {
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }

    const query = value.trim();
    const resolvable = isResolvableQuery(query);
    if (!query || (!resolvable && query.length < 3)) return;

    const cached = cacheRef.current.get(query);
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (cached) {
          setVideos(cached);
          if (shouldAutoOpenRef.current) setOpen(true);
          setLookingUp(false);
          return;
        }

        setLookingUp(true);
        try {
          const response = await fetch(
            resolvable ? "/api/resolve" : "/api/search",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
              signal: controller.signal,
            }
          );
          if (!response.ok) throw new Error("Suggestion lookup failed");

          const data = (await response.json()) as
            | ResolveResponse
            | SearchResponse;
          const result = data.result as QueryResult;
          const found = result.videos.slice(0, 6);
          cacheRef.current.set(query, found);
          setVideos(found);
          if (shouldAutoOpenRef.current) setOpen(true);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setVideos([]);
          }
        } finally {
          if (!controller.signal.aborted) setLookingUp(false);
        }
      },
      cached ? 0 : resolvable ? 120 : 400
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const suggestions = useMemo<SearchSuggestion[]>(
    () =>
      videos.map((video) => ({
        id: video.id,
        title: video.title,
        subtitle: video.author,
        imageUrl: video.thumbnailUrl,
        badge: video.duration > 0 ? formatDuration(video.duration) : undefined,
      })),
    [videos]
  );

  const updateValue = (nextValue: string) => {
    shouldAutoOpenRef.current = true;
    setValue(nextValue);
    setOpen(true);
    const query = nextValue.trim();
    if (!query || (!isResolvableQuery(query) && query.length < 3)) {
      setVideos([]);
      setLookingUp(false);
    }
  };

  return (
    <SearchField
      value={value}
      onValueChange={updateValue}
      onSubmit={onSubmit}
      loading={loading}
      autoFocus={autoFocus}
      size={size}
      suggestions={suggestions}
      suggestionsOpen={open}
      suggestionsLoading={lookingUp}
      onSuggestionsOpenChange={setOpen}
      onSuggestionPrefetch={(suggestion) => prefetchStreamOptions(suggestion.id)}
      onSuggestionSelect={(suggestion) => {
        const video = videos.find((item) => item.id === suggestion.id);
        if (!video) return;
        skipNextLookupRef.current = true;
        setValue(video.title);
        if (onSelectVideo) onSelectVideo(video);
        else onSubmit(video.id);
      }}
      labels={{
        placeholder: placeholder ?? t.search.defaultPlaceholder,
        submit: t.search.findMedia,
        working: t.search.working,
        suggestions: t.search.suggestions,
        looking: t.search.looking,
        paste: t.search.paste,
        clear: t.search.clear,
      }}
    />
  );
}

function isResolvableQuery(query: string): boolean {
  return (
    VIDEO_ID_PATTERN.test(query) ||
    /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(query)
  );
}
