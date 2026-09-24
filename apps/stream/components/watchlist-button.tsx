"use client";

import { Bookmark } from "@phosphor-icons/react/ssr";
import { toggleWatchlist, useWatchlist, type WatchlistMedia } from "@/lib/watchlist";

export function WatchlistButton({ media, compact = false }: { media: WatchlistMedia; compact?: boolean }) {
  const { items, ready } = useWatchlist();
  const saved = items.some((item) => item.id === media.id && item.mediaType === media.mediaType);
  return (
    <button
      type="button"
      className={compact ? "poster-save" : "watchlist-action"}
      aria-label={`${saved ? "Remove" : "Save"} ${media.title} ${saved ? "from" : "to"} watchlist`}
      aria-pressed={saved}
      disabled={!ready}
      onClick={() => toggleWatchlist(media)}
    >
      <Bookmark weight={saved ? "fill" : "regular"} size={compact ? 18 : 19} aria-hidden="true" />
      {!compact && (saved ? "Saved to watchlist" : "Save to watchlist")}
    </button>
  );
}
