"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchField } from "@phantom/ui";
import { buildChannelPath, buildVodPath, extractChannelName, extractClipSlug, extractVodId } from "@/lib/validation";
import { categoryPath, categorySearchPath } from "@/lib/categories";
import { rememberSearchSelection } from "@/lib/search/client";
import { useCategorySearch } from "./use-category-search";
import { useSearch } from "./use-search";

/**
 * The one way into a channel, video or category. The header and the home page each mount their own.
 * Among the categories it is a category search first: they lead the suggestions and a plain submit opens one.
 */
export function StillSearch({ inputId = "global-search-input", size = "compact" }: { inputId?: string; size?: "default" | "compact" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState("");
  const query = value.trim();
  const { suggestions: channels, searching, lookupPending, error } = useSearch(value, open);
  const browsing = usePathname() === "/categories";
  const { categories, suggestions: categorySuggestions, find: findCategory } = useCategorySearch(value, open, browsing ? 6 : 3);
  const suggestions = browsing ? [...categorySuggestions, ...channels] : [...channels, ...categorySuggestions];

  const submit = (input: string) => {
    const clipSlug = extractClipSlug(input);
    if (clipSlug) return router.push(`/clips/${encodeURIComponent(clipSlug)}`);
    const video = extractVodId(input);
    if (video) return router.push(buildVodPath(video));
    const explicitChannel = /^https?:\/\//i.test(input) || input.startsWith("@");
    if (browsing && !explicitChannel) return router.push(categories[0] ? categoryPath(categories[0]) : categorySearchPath(input.slice(0, 100)));
    const channel = extractChannelName(input);
    if (channel) {
      const match = channels[0];
      const explicit = /^https?:\/\//i.test(input) || input.startsWith("@");
      // Keep a cold plain-name submit in search until complete matches arrive.
      if (!explicit && !match && lookupPending) { setOpen(true); return; }
      const selected = !explicit && match && !match.id.startsWith("vod:") ? match.id : channel;
      rememberSearchSelection(selected);
      return router.push(buildChannelPath(selected));
    }
    if (channels[0]) { rememberSearchSelection(channels[0].id); return router.push(buildChannelPath(channels[0].id)); }
    if (categories[0]) return router.push(categoryPath(categories[0]));
    setInputError("Enter a Twitch channel, category, video ID, or video/clip URL.");
    setOpen(true);
  };

  return <SearchField
    inputId={inputId}
    value={value}
    onValueChange={(next) => {
      setValue(next); setInputError(""); setOpen(true);
    }}
    onSubmit={submit}
    labels={{ placeholder: browsing ? "Find a category" : "Channel, category or link", submit: "Open Twitch content", working: "Searching", suggestions: "Channels, categories and videos", looking: "Searching Twitch…", paste: "Paste from clipboard", empty: inputError || error || (browsing ? "No matching categories yet. Press Enter to search every category." : "No matching channels yet. Enter a full username to look it up.") }}
    suggestions={suggestions}
    suggestionsOpen={open && query.length >= 2}
    suggestionsLoading={searching}
    onSuggestionsOpenChange={setOpen}
    onSuggestionSelect={(item) => {
      const category = findCategory(item.id);
      if (category) router.push(categoryPath(category));
      else if (item.id.startsWith("vod:")) router.push(buildVodPath(item.id.slice(4)));
      else { rememberSearchSelection(item.id); router.push(buildChannelPath(item.id)); }
    }}
    size={size}
  />;
}
