"use client";

import { useEffect, useState } from "react";
import type { SearchSuggestion } from "@phantom/ui";
import { rankCategories, type Category } from "@/lib/categories";
import { formatCount } from "@/lib/format";
import { extractClipSlug, extractVodId } from "@/lib/validation";

const PREFIX = "category:";

/**
 * Categories matching what is typed, as search suggestions. One request per settled query, kept for the
 * life of the field; a link, an @handle or a video ID names something else and asks for nothing.
 * Suggestions are keyed by Twitch's ID, since several categories can share a name; `find` gives back the category behind one.
 */
export function useCategorySearch(value: string, active: boolean, limit: number) {
  const query = value.trim().toLowerCase();
  const named = query.length >= 2 && query.length <= 80 && !query.startsWith("@") && !/^https?:\/\//.test(query) && !extractVodId(query) && !extractClipSlug(query);
  // A Map, because what is typed is the key and "constructor" is a thing people can type.
  const [answers, setAnswers] = useState<ReadonlyMap<string, Category[]>>(() => new Map());
  const known = answers.get(query);

  useEffect(() => {
    if (!active || !named || known) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/categories/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : { categories: [] })
        // A failed lookup is remembered as empty: channels still answer, and typing on asks afresh.
        .then((data: { categories?: Category[] }) => setAnswers(all => new Map(all).set(query, Array.isArray(data.categories) ? data.categories : [])), () => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, named, known, query]);

  const categories = named && known ? rankCategories(known, query).slice(0, limit) : [];
  const suggestions: SearchSuggestion[] = categories.map(category => ({
    id: `${PREFIX}${category.id}`, title: category.name, subtitle: category.viewers ? `${formatCount(category.viewers)} watching` : "Nobody live",
    imageUrl: category.boxArt, thumbnail: "poster", meta: "Category",
  }));
  const find = (id: string) => id.startsWith(PREFIX) ? categories.find(category => category.id === id.slice(PREFIX.length)) : undefined;
  return { categories, suggestions, find };
}
