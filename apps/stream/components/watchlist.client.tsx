"use client";

import Link from "next/link";
import { Bookmark } from "@phosphor-icons/react/ssr";
import { PosterTile } from "@/components/poster-tile";
import { useWatchlist } from "@/lib/watchlist";

export function WatchlistContent() {
  const { items, ready, error } = useWatchlist();
  return (
    <section className="app-shell flex-1 py-8 sm:py-12" aria-labelledby="watchlist-heading">
      <h1 id="watchlist-heading" className="text-2xl font-bold sm:text-3xl">Your watchlist</h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        Saved in this browser. Clearing site data removes your list.
      </p>
      {!ready ? <p role="status" className="py-12 text-text-secondary">Loading your watchlist…</p> : items.length > 0 ? (
        <>
          <p className="mt-6 text-sm text-text-secondary" role="status">{items.length} {items.length === 1 ? "title" : "titles"}, newest saved first</p>
          <div className="watchlist-grid mt-5">
            {items.map((media) => <PosterTile key={`${media.mediaType}:${media.id}`} media={media} />)}
          </div>
        </>
      ) : !error ? (
        <div className="watchlist-empty">
          <Bookmark weight="regular" size={36} aria-hidden="true" />
          <h2 className="mt-5 text-xl font-semibold">Keep something for later</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-text-secondary">Tap the bookmark on a film or series to save it here.</p>
          <Link href="/" className="cinema-button mt-6">Find something to watch</Link>
        </div>
      ) : null}
    </section>
  );
}
