"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import {
  IconArrowUpRight,
  IconClipboard,
  IconSearch,
} from "@tabler/icons-react";
import type {
  QueryResult,
  ResolveResponse,
  SearchResponse,
  VideoInfo,
} from "@/lib/types";
import { formatDuration } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";

interface SearchBarProps {
  onSubmit: (query: string) => void;
  onSelectVideo?: (video: VideoInfo) => void;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function SearchBar({
  onSubmit,
  onSelectVideo,
  loading = false,
  placeholder,
  autoFocus = false,
}: SearchBarProps) {
  const { messages: t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t.search.defaultPlaceholder;
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<VideoInfo[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef(new Map<string, VideoInfo[]>());
  const skipNextLookupRef = useRef(false);
  const suggestionsId = useId();

  useEffect(() => {
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }

    const query = value.trim();
    const resolvable = isResolvableQuery(query);

    if (!query || (!resolvable && query.length < 3)) {
      return;
    }

    const cached = cacheRef.current.get(query);
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (cached) {
          setSuggestions(cached);
          setSuggestionsOpen(true);
          setSuggestionsLoading(false);
          return;
        }

        setSuggestionsLoading(true);

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
          const videos = result.videos.slice(0, 6);
          cacheRef.current.set(query, videos);
          setSuggestions(videos);
          setSuggestionsOpen(true);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSuggestions([]);
          }
        } finally {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        }
      },
      cached ? 0 : resolvable ? 120 : 400
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }
    setSuggestionsOpen(false);
    onSubmit(query);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        updateValue(text.trim());
        setSuggestionsOpen(true);
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleSuggestion = (video: VideoInfo) => {
    skipNextLookupRef.current = true;
    setValue(video.title);
    setSuggestionsOpen(false);
    if (onSelectVideo) {
      onSelectVideo(video);
    } else {
      onSubmit(video.id);
    }
  };

  const updateValue = (nextValue: string) => {
    setValue(nextValue);
    setSuggestionsOpen(true);
    if (
      !nextValue.trim() ||
      (!isResolvableQuery(nextValue.trim()) && nextValue.trim().length < 3)
    ) {
      setSuggestions([]);
      setSuggestionsLoading(false);
    }
  };

  const showSuggestions =
    suggestionsOpen && (suggestionsLoading || suggestions.length > 0);

  return (
    <div className="relative">
      <form
        onSubmit={handleSubmit}
        onFocus={() => {
          if (suggestions.length > 0) setSuggestionsOpen(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setSuggestionsOpen(false);
          }
        }}
        className="soft-input flex h-14 items-center gap-1 rounded-2xl pl-3.5 pr-1.5 shadow-[0_6px_20px_rgba(57,43,28,0.07)] transition-colors focus-within:border-text/30 sm:h-[3.75rem] sm:pl-4 sm:pr-2"
      >
        <IconSearch size={19} stroke={2} className="shrink-0 text-text-tertiary" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          placeholder={resolvedPlaceholder}
          disabled={loading}
          autoFocus={autoFocus}
          enterKeyHint="search"
          aria-label={resolvedPlaceholder}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={suggestionsId}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent px-2.5 text-[15px] font-medium text-text outline-none placeholder:font-normal placeholder:text-text-tertiary disabled:opacity-50 sm:px-3"
        />

        <button
          type="button"
          onClick={handlePaste}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-bg hover:text-text"
          aria-label={t.search.paste}
          title={t.search.paste}
        >
          <IconClipboard size={18} stroke={1.9} />
        </button>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-phantom px-3.5 text-sm font-extrabold text-white transition-colors hover:bg-phantom-dark disabled:cursor-wait sm:h-12 sm:px-5"
          aria-label={t.search.findMedia}
        >
          <span className="hidden sm:inline">
            {loading ? t.search.working : t.search.findMedia}
          </span>
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          ) : (
            <IconArrowUpRight size={17} stroke={2.4} />
          )}
        </button>
      </form>

      {showSuggestions && (
        <div
          id={suggestionsId}
          role="listbox"
          aria-label={t.search.suggestions}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(52svh,340px)] overflow-y-auto rounded-2xl border border-border bg-surface/98 p-1.5 shadow-[0_18px_50px_rgba(45,35,24,0.16)] backdrop-blur-md"
        >
          {suggestionsLoading && suggestions.length === 0 && (
            <div className="flex h-14 items-center gap-3 px-3 text-xs text-text-tertiary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-phantom" />
              {t.search.looking}
            </div>
          )}
          {suggestions.map((video) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={video.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSuggestion(video)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-bg"
            >
              <span className="relative h-12 w-[84px] shrink-0 overflow-hidden rounded-lg bg-border">
                <Image
                  src={video.thumbnailUrl}
                  alt=""
                  fill
                  sizes="84px"
                  unoptimized
                  className="h-full w-full object-cover"
                />
                {video.duration > 0 && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-1 block text-[13px] font-bold text-text">
                  {video.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">
                  {video.author}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function isResolvableQuery(query: string): boolean {
  return (
    VIDEO_ID_PATTERN.test(query) ||
    /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(query)
  );
}
