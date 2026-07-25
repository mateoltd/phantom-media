"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchField, type SearchSuggestion } from "@phantom/ui";
import { kindLabel, looksLikeIdentifier, mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

interface SearchPayload {
  results?: MediaResult[];
  error?: string;
}

interface MediaSearchProps {
  /** Prefills the field on the results page so the query stays editable. */
  initialQuery?: string;
  autoFocus?: boolean;
  size?: "default" | "compact";
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

function isLookupWorthy(query: string): boolean {
  return query.length >= MIN_QUERY_LENGTH || looksLikeIdentifier(query);
}

/**
 * The stream app's half of the shared search field: it owns the debounce and
 * decides whether a query lands on the results grid or straight on a title.
 *
 * Results from the previous query stay on screen while the next one is in
 * flight. Blanking the list on every keystroke is what made typing feel like
 * the field had stopped responding.
 */
export function MediaSearch({
  initialQuery = "",
  autoFocus = false,
  size = "default",
}: MediaSearchProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [value, setValue] = useState(initialQuery);
  const [results, setResults] = useState<MediaResult[]>([]);
  const [open, setOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const cacheRef = useRef(new Map<string, MediaResult[]>());
  const skipNextLookupRef = useRef(false);

  useEffect(() => {
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }

    const query = value.trim();
    if (!isLookupWorthy(query)) return;

    const cached = cacheRef.current.get(query);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (cached) {
        setResults(cached);
        setLookingUp(false);
        return;
      }

      setLookingUp(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as SearchPayload;
        if (!response.ok) throw new Error(payload.error ?? "Search failed");

        const found = payload.results ?? [];
        cacheRef.current.set(query, found);
        setResults(found);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLookingUp(false);
      }
    }, cached ? 0 : DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const suggestions = useMemo<SearchSuggestion[]>(
    () =>
      results.slice(0, 8).map((media) => ({
        id: `${media.mediaType}-${media.id}`,
        title: media.title,
        subtitle: kindLabel(media.mediaType),
        meta: media.year,
        imageUrl: media.posterUrl,
      })),
    [results]
  );

  const findMedia = (suggestionId: string) =>
    results.find((item) => `${item.mediaType}-${item.id}` === suggestionId);

  const go = (href: string) => startNavigation(() => router.push(href));

  return (
    <SearchField
      value={value}
      loading={navigating}
      onValueChange={(next) => {
        setValue(next);
        setOpen(true);
        if (!isLookupWorthy(next.trim())) {
          setResults([]);
          setLookingUp(false);
        }
      }}
      onSubmit={(query) => {
        // One work, one destination: an identifier goes straight to the player.
        const only =
          looksLikeIdentifier(query) && results.length === 1 ? results[0] : null;
        go(only ? mediaHref(only) : `/search?q=${encodeURIComponent(query)}`);
      }}
      onSuggestionSelect={(suggestion) => {
        const media = findMedia(suggestion.id);
        if (!media) return;
        skipNextLookupRef.current = true;
        setValue(media.title);
        go(mediaHref(media));
      }}
      onSuggestionPrefetch={(suggestion) => {
        const media = findMedia(suggestion.id);
        if (media) router.prefetch(mediaHref(media));
      }}
      suggestions={suggestions}
      suggestionsOpen={open}
      suggestionsLoading={lookingUp}
      onSuggestionsOpenChange={setOpen}
      thumbnail="poster"
      size={size}
      autoFocus={autoFocus}
      labels={{
        placeholder: "Search a title, or paste an IMDb link",
        submit: "Search",
        working: "Opening",
        suggestions: "Matching titles",
        looking: "Searching the catalog",
        empty: "Nothing matched that",
      }}
    />
  );
}
