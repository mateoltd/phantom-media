"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchField } from "@phantom/ui";
import { buildChannelPath, buildVodPath, extractChannelName, extractClipSlug, extractVodId } from "@/lib/validation";
import { rememberSearchSelection } from "@/lib/search/client";
import { useSearch } from "./use-search";

/** The one way into a channel or video. The header and the home page each mount their own. */
export function TwitchSearch({ inputId = "global-search-input", size = "compact" }: { inputId?: string; size?: "default" | "compact" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState("");
  const query = value.trim();
  const { suggestions, searching, lookupPending, error } = useSearch(value, open);

  const submit = (input: string) => {
    const clipSlug = extractClipSlug(input);
    if (clipSlug) return router.push(`/clips/${encodeURIComponent(clipSlug)}`);
    const video = extractVodId(input);
    if (video) return router.push(buildVodPath(video));
    const channel = extractChannelName(input);
    if (channel) {
      const match = suggestions[0];
      const explicit = /^https?:\/\//i.test(input) || input.startsWith("@");
      // Keep a cold plain-name submit in search until complete matches arrive.
      if (!explicit && !match && lookupPending) { setOpen(true); return; }
      const selected = !explicit && match && !match.id.startsWith("vod:") ? match.id : channel;
      rememberSearchSelection(selected);
      return router.push(buildChannelPath(selected));
    }
    if (suggestions[0]) { rememberSearchSelection(suggestions[0].id); return router.push(buildChannelPath(suggestions[0].id)); }
    setInputError("Enter a Twitch channel, video ID, or video/clip URL.");
    setOpen(true);
  };

  return <SearchField
    inputId={inputId}
    value={value}
    onValueChange={(next) => {
      setValue(next); setInputError(""); setOpen(true);
    }}
    onSubmit={submit}
    labels={{ placeholder: "Channel, video or clip link", submit: "Open Twitch content", working: "Searching", suggestions: "Channels and videos", looking: "Searching Twitch…", paste: "Paste from clipboard", empty: inputError || error || "No matching channels yet. Enter a full username to look it up." }}
    suggestions={suggestions}
    suggestionsOpen={open && query.length >= 2}
    suggestionsLoading={searching}
    onSuggestionsOpenChange={setOpen}
    onSuggestionSelect={(item) => {
      if (item.id.startsWith("vod:")) router.push(buildVodPath(item.id.slice(4)));
      else { rememberSearchSelection(item.id); router.push(buildChannelPath(item.id)); }
    }}
    size={size}
  />;
}
