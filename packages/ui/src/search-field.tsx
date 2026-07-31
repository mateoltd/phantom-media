"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Artwork } from "./artwork";
import {
  IconArrowUpRight,
  IconClipboard,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  imageUrl?: string | null;
  badge?: string;
}

export interface SearchFieldLabels {
  placeholder: string;
  submit: string;
  working: string;
  suggestions: string;
  looking: string;
  paste?: string;
  empty?: string;
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
  onSuggestionPrefetch?: (suggestion: SearchSuggestion) => void;
  thumbnail?: "video" | "poster" | "none";
  size?: "default" | "compact";
  className?: string;
}

const SIZES = {
  default: {
    form: "h-[52px] pl-4 pr-1.5 sm:h-14",
    icon: 19,
    input: "px-2.5 text-[15px] sm:px-3",
    accessory: "h-9 w-9",
    accessoryIcon: 16,
    pasteIcon: 18,
    submit: "h-10 w-10",
    submitIcon: 19,
    spinner: "h-4 w-4",
  },
  compact: {
    form: "h-11 pl-3.5 pr-1",
    icon: 17,
    input: "px-2 text-[14px] sm:px-2.5",
    accessory: "h-8 w-8",
    accessoryIcon: 15,
    pasteIcon: 16,
    submit: "h-9 w-9",
    submitIcon: 17,
    spinner: "h-3.5 w-3.5",
  },
} as const;

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
  size = "default",
  className = "",
}: SearchFieldProps) {
  const metrics = SIZES[size];
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = suggestions.findIndex(
    (suggestion) => suggestion.id === activeId
  );

  const empty = Boolean(labels.empty) && !suggestionsLoading && suggestions.length === 0;
  const open = suggestionsOpen && (suggestionsLoading || suggestions.length > 0 || empty);

  useEffect(() => {
    if (!activeId) return;
    listRef.current
      ?.querySelector(`[data-suggestion="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const setOpen = (next: boolean) => onSuggestionsOpenChange?.(next);

  const highlight = (id: string | null) => {
    setActiveId(id);
    const suggestion = suggestions.find((item) => item.id === id);
    if (suggestion) onSuggestionPrefetch?.(suggestion);
  };

  const moveHighlight = (direction: 1 | -1) => {
    const count = suggestions.length;
    if (count === 0) return;
    const next =
      activeIndex < 0
        ? direction === 1
          ? 0
          : count - 1
        : (activeIndex + direction + count) % count;
    highlight(suggestions[next]?.id ?? null);
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

  const clear = () => {
    onValueChange("");
    setActiveId(null);
    inputRef.current?.focus();
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
        className={`search-pill flex items-center gap-1 ${metrics.form}`}
      >
        <IconSearch
          size={metrics.icon}
          stroke={2}
          className="shrink-0 text-text-secondary"
        />
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
          className={`min-w-0 flex-1 bg-transparent font-medium text-text outline-none placeholder:font-normal placeholder:text-text-tertiary disabled:opacity-50 ${metrics.input}`}
        />

        {value && !loading && (
          <button
            type="button"
            onClick={clear}
            className={`flex shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg hover:text-text ${metrics.accessory}`}
            aria-label="Clear"
          >
            <IconX size={metrics.accessoryIcon} stroke={2.2} />
          </button>
        )}

        {labels.paste && (
          <button
            type="button"
            onClick={handlePaste}
            className={`flex shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg hover:text-text ${metrics.accessory}`}
            aria-label={labels.paste}
            title={labels.paste}
          >
            <IconClipboard size={metrics.pasteIcon} stroke={1.9} />
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`search-pill-submit flex shrink-0 items-center justify-center rounded-full ${metrics.submit}`}
          aria-label={loading ? labels.working : labels.submit}
          title={labels.submit}
        >
          {loading ? (
            <span
              className={`animate-spin rounded-full border-2 border-white/35 border-t-white ${metrics.spinner}`}
            />
          ) : (
            <IconArrowUpRight size={metrics.submitIcon} stroke={2.4} />
          )}
        </button>
      </form>

      {open && (
        <div className="animate-panel-in absolute inset-x-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[22px] border border-border bg-surface/98 shadow-[0_28px_80px_var(--surface-shadow)] backdrop-blur-md">
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={labels.suggestions}
            className="inset-scroll max-h-[min(52svh,336px)] p-2.5"
          >
            {suggestionsLoading && suggestions.length === 0 && (
              <div className="flex h-12 items-center gap-3 px-3 text-xs text-text-tertiary">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-phantom" />
                {labels.looking}
              </div>
            )}

            {empty && (
              <div className="flex h-12 items-center px-3 text-xs text-text-tertiary">
                {labels.empty}
              </div>
            )}

            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                role="option"
                id={`${listboxId}-option-${index}`}
                data-suggestion={suggestion.id}
                aria-selected={index === activeIndex}
                key={suggestion.id}
                onMouseDown={(event) => event.preventDefault()}
                onPointerEnter={() => onSuggestionPrefetch?.(suggestion)}
                onPointerDown={() => onSuggestionPrefetch?.(suggestion)}
                onFocus={() => onSuggestionPrefetch?.(suggestion)}
                onClick={() => choose(suggestion)}
                className={`flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors ${
                  index === activeIndex ? "bg-bg" : "hover:bg-bg"
                }`}
              >
                {thumbnail !== "none" && (
                  <span
                    className={`relative shrink-0 overflow-hidden rounded-lg bg-border ${
                      thumbnail === "poster" ? "h-12 w-8" : "h-11 w-[76px]"
                    }`}
                  >
                    <Artwork
                      src={suggestion.imageUrl}
                      sizes={thumbnail === "poster" ? "32px" : "76px"}
                      fallback={
                        <span className="flex h-full w-full items-center justify-center text-[13px] font-extrabold text-text-tertiary">
                          {suggestion.title.slice(0, 1)}
                        </span>
                      }
                    />
                    {suggestion.badge && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] text-white">
                        {suggestion.badge}
                      </span>
                    )}
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-[13px] font-bold text-text">
                    {suggestion.title}
                  </span>
                  {suggestion.subtitle && (
                    <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">
                      {suggestion.subtitle}
                    </span>
                  )}
                </span>

                {suggestion.meta && (
                  <span className="shrink-0 pr-1 font-mono text-[11px] text-text-tertiary">
                    {suggestion.meta}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
