"use client";

import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import Image from "next/image";
import {
  IconArrowUpRight,
  IconClipboard,
  IconSearch,
} from "@tabler/icons-react";

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  /** Short overlay printed on the thumbnail, e.g. a duration or a year. */
  badge?: string;
}

export interface SearchFieldLabels {
  placeholder: string;
  submit: string;
  working: string;
  suggestions: string;
  looking: string;
  /** Set to show the clipboard button. */
  paste?: string;
}

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  labels: SearchFieldLabels;
  loading?: boolean;
  autoFocus?: boolean;
  suggestions?: readonly SearchSuggestion[];
  suggestionsOpen?: boolean;
  suggestionsLoading?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  /** Fired on hover and focus so callers can warm a fetch. */
  onSuggestionPrefetch?: (suggestion: SearchSuggestion) => void;
  /** Landscape thumbnails for video, 2:3 for posters. */
  thumbnail?: "video" | "poster" | "none";
  className?: string;
}

/**
 * The one search field in the Phantom system. It is rounded because every
 * other surface here is — panels, rails, menus — and a square field would be
 * the only hard corner on the page.
 *
 * The caller owns the query, the fetching and the debounce; this owns the
 * chrome, the keyboard model and the combobox semantics.
 */
export function SearchField({
  value,
  onValueChange,
  onSubmit,
  labels,
  loading = false,
  autoFocus = false,
  suggestions = [],
  suggestionsOpen = false,
  suggestionsLoading = false,
  onSuggestionsOpenChange,
  onSuggestionSelect,
  onSuggestionPrefetch,
  thumbnail = "video",
  className = "",
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  // The highlight is held as an id, not an index, so a list that changes
  // underneath the keyboard drops the highlight instead of moving it onto
  // whatever now happens to sit at that position.
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = suggestions.findIndex(
    (suggestion) => suggestion.id === activeId
  );

  const open = suggestionsOpen && (suggestionsLoading || suggestions.length > 0);

  const setOpen = (next: boolean) => onSuggestionsOpenChange?.(next);

  const moveHighlight = (direction: 1 | -1) => {
    const count = suggestions.length;
    if (count === 0) return;
    const next =
      activeIndex < 0
        ? direction === 1
          ? 0
          : count - 1
        : (activeIndex + direction + count) % count;
    setActiveId(suggestions[next]?.id ?? null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    onSubmit(query);
  };

  const choose = (suggestion: SearchSuggestion) => {
    setOpen(false);
    setActiveId(null);
    if (onSuggestionSelect) onSuggestionSelect(suggestion);
    else onSubmit(suggestion.title);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveId(null);
      return;
    }
    if (suggestions.length === 0) return;
    if (!open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        event.preventDefault();
        choose(suggestion);
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onValueChange(text.trim());
        setOpen(true);
      }
    } finally {
      inputRef.current?.focus();
    }
  };

  const activeDescendant =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className={`relative ${className}`}>
      <form
        onSubmit={handleSubmit}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
        className="soft-input flex h-14 items-center gap-1 rounded-2xl pl-3.5 pr-1.5 shadow-[0_6px_20px_rgba(57,43,28,0.07)] transition-colors focus-within:border-text/30 sm:h-[3.75rem] sm:pl-4 sm:pr-2"
      >
        <IconSearch size={19} stroke={2} className="shrink-0 text-text-tertiary" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={labels.placeholder}
          disabled={loading}
          autoFocus={autoFocus}
          enterKeyHint="search"
          aria-label={labels.placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-2.5 text-[15px] font-medium text-text outline-none placeholder:font-normal placeholder:text-text-tertiary disabled:opacity-50 sm:px-3"
        />

        {labels.paste && (
          <button
            type="button"
            onClick={handlePaste}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-bg hover:text-text"
            aria-label={labels.paste}
            title={labels.paste}
          >
            <IconClipboard size={18} stroke={1.9} />
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-phantom px-3.5 text-sm font-extrabold text-white transition-colors hover:bg-phantom-dark disabled:cursor-wait sm:h-12 sm:px-5"
          aria-label={labels.submit}
        >
          <span className="hidden sm:inline">
            {loading ? labels.working : labels.submit}
          </span>
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          ) : (
            <IconArrowUpRight size={17} stroke={2.4} />
          )}
        </button>
      </form>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={labels.suggestions}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(52svh,340px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface/98 p-1.5 shadow-[0_18px_50px_rgba(45,35,24,0.16)] backdrop-blur-md"
        >
          {suggestionsLoading && suggestions.length === 0 && (
            <div className="flex h-14 items-center gap-3 px-3 text-xs text-text-tertiary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-phantom" />
              {labels.looking}
            </div>
          )}

          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              id={`${listboxId}-option-${index}`}
              aria-selected={index === activeIndex}
              key={suggestion.id}
              onMouseDown={(event) => event.preventDefault()}
              onPointerEnter={() => onSuggestionPrefetch?.(suggestion)}
              onPointerDown={() => onSuggestionPrefetch?.(suggestion)}
              onFocus={() => onSuggestionPrefetch?.(suggestion)}
              onClick={() => choose(suggestion)}
              className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                index === activeIndex ? "bg-bg" : "hover:bg-bg"
              }`}
            >
              {thumbnail !== "none" && (
                <span
                  className={`relative shrink-0 overflow-hidden rounded-lg bg-border ${
                    thumbnail === "poster" ? "h-14 w-[38px]" : "h-12 w-[84px]"
                  }`}
                >
                  {suggestion.imageUrl ? (
                    <Image
                      src={suggestion.imageUrl}
                      alt=""
                      fill
                      sizes={thumbnail === "poster" ? "38px" : "84px"}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[13px] font-extrabold text-text-tertiary">
                      {suggestion.title.slice(0, 1)}
                    </span>
                  )}
                  {suggestion.badge && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] text-white">
                      {suggestion.badge}
                    </span>
                  )}
                </span>
              )}
              <span className="min-w-0">
                <span className="line-clamp-1 block text-[13px] font-bold text-text">
                  {suggestion.title}
                </span>
                {suggestion.subtitle && (
                  <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">
                    {suggestion.subtitle}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
