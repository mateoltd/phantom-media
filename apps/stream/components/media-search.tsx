"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchField, type SearchSuggestion } from "@phantom/ui";
import { posterUrl } from "@/lib/media-images";
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
}

/**
 * The stream app's half of the shared search field: it owns the debounce and
 * decides whether a query lands on the results grid or straight on a title.
 */
export function MediaSearch({
  initialQuery = "",
  autoFocus = false,
}: MediaSearchProps) {
  const router = useRouter();
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
    const identifier = looksLikeIdentifier(query);
    if (!query || (!identifier && query.length < 3)) return;

    const cached = cacheRef.current.get(query);
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (cached) {
          setResults(cached);
          setOpen(true);
          setLookingUp(false);
          return;
        }

        setLookingUp(true);
        try {
          const response = await fetch(
            `/api/search?q=${encodeURIComponent(query)}`,
            { signal: controller.signal }
          );
          const payload = (await response.json()) as SearchPayload;
          if (!response.ok) throw new Error(payload.error ?? "Search failed");

          const found = payload.results ?? [];
          cacheRef.current.set(query, found);
          setResults(found);
          setOpen(true);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setResults([]);
          }
        } finally {
          if (!controller.signal.aborted) setLookingUp(false);
        }
      },
      cached ? 0 : identifier ? 150 : 340
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const suggestions = useMemo<SearchSuggestion[]>(
    () =>
      results.slice(0, 7).map((media) => ({
        id: `${media.mediaType}-${media.id}`,
        title: media.title,
        subtitle: `${kindLabel(media.mediaType)} · ${media.year || "Year unknown"}`,
        imageUrl: posterUrl(media, "w154"),
      })),
    [results]
  );

  return (
    <SearchField
      value={value}
      onValueChange={(next) => {
        setValue(next);
        setOpen(true);
        const query = next.trim();
        if (!query || (!looksLikeIdentifier(query) && query.length < 3)) {
          setResults([]);
          setLookingUp(false);
        }
      }}
      onSubmit={(query) => {
        // One work, one destination: an identifier goes straight to the player.
        const only = looksLikeIdentifier(query) && results.length === 1
          ? results[0]
          : null;
        router.push(
          only ? mediaHref(only) : `/search?q=${encodeURIComponent(query)}`
        );
      }}
      onSuggestionSelect={(suggestion) => {
        const media = results.find(
          (item) => `${item.mediaType}-${item.id}` === suggestion.id
        );
        if (!media) return;
        skipNextLookupRef.current = true;
        setValue(media.title);
        router.push(mediaHref(media));
      }}
      suggestions={suggestions}
      suggestionsOpen={open}
      suggestionsLoading={lookingUp}
      onSuggestionsOpenChange={setOpen}
      thumbnail="poster"
      autoFocus={autoFocus}
      labels={{
        placeholder: "Search a title, or paste an IMDb link",
        submit: "Search",
        working: "Searching",
        suggestions: "Matching titles",
        looking: "Looking through the catalog",
        paste: "Paste from clipboard",
      }}
    />
  );
}
