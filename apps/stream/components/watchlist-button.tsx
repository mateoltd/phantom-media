"use client";

import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react";
import { toggleWatchlist, useWatchlist, type WatchlistMedia } from "@/lib/watchlist";

export function WatchlistButton({ media, compact = false }: { media: WatchlistMedia; compact?: boolean }) {
  const { items, ready } = useWatchlist();
  const saved = items.some((item) => item.id === media.id && item.mediaType === media.mediaType);
  const Icon = saved ? IconBookmarkFilled : IconBookmark;
  return (
    <button
      type="button"
      className={compact ? "poster-save" : "watchlist-action"}
      aria-label={`${saved ? "Remove" : "Save"} ${media.title} ${saved ? "from" : "to"} watchlist`}
      aria-pressed={saved}
      disabled={!ready}
      onClick={() => toggleWatchlist(media)}
    >
      <Icon size={compact ? 18 : 19} stroke={1.5} aria-hidden="true" />
      {!compact && (saved ? "Saved to watchlist" : "Save to watchlist")}
    </button>
  );
}
