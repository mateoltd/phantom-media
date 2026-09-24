"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { MediaHeader, Wordmark } from "@phantom/ui";
import { usePathname } from "next/navigation";
import { useWatchlist } from "@/lib/watchlist";
import { MediaSearch } from "@/components/media-search";

export function AppHeader({
  initialQuery,
  floating = false,
}: {
  initialQuery?: string;
  floating?: boolean;
}) {
  const pathname = usePathname();
  const { items, error } = useWatchlist();

  return (
    <MediaHeader
      routeKey={pathname}
      floating={floating}
      brand={<Link href="/" aria-label="Phantom Stream home">
        <Wordmark service="Stream" tone="chalk" className="hidden sm:flex" />
        <Wordmark tone="chalk" className="sm:hidden" />
      </Link>}
      search={<MediaSearch key={initialQuery ?? ""} initialQuery={initialQuery} size="compact" />}
      actions={
        <Link
          href="/watchlist"
          className="media-header-action"
          aria-label={`Watchlist${items.length ? `, ${items.length} saved ${items.length === 1 ? "title" : "titles"}` : ""}`}
          aria-current={pathname === "/watchlist" ? "page" : undefined}
        >
          <Bookmark size={20} strokeWidth={1.6} fill={items.length ? "currentColor" : "none"} aria-hidden="true" />
        </Link>
      }
      notice={error && <p role="alert" className="watchlist-error">{error}</p>}
    />
  );
}
