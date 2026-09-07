"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconBookmark, IconBookmarkFilled, IconSearch } from "@tabler/icons-react";
import { Wordmark } from "@phantom/ui";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const { items, error } = useWatchlist();
  const BookmarkIcon = items.length ? IconBookmarkFilled : IconBookmark;

  useEffect(() => {
    function updateScrollSurface() {
      if (headerRef.current) {
        headerRef.current.dataset.scrolled = String(window.scrollY > 16);
      }
    }
    updateScrollSurface();
    window.addEventListener("scroll", updateScrollSurface, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollSurface);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector("input")?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  }
  return (
    <header
      ref={headerRef}
      className={`stream-header ${floating ? "stream-header-over-art" : ""}`}
      data-search-open={searchOpen}
    >
      <div className="app-shell stream-header-inner">
        <Link
          href="/"
          aria-label="Phantom Stream home"
          className="stream-header-brand shrink-0 justify-self-start"
        >
          <Wordmark service="Stream" tone="chalk" className="hidden sm:flex" />
          <Wordmark tone="chalk" className="sm:hidden" />
        </Link>
        <button
          ref={searchTriggerRef}
          type="button"
          className="stream-header-search-trigger"
          aria-label="Open search"
          aria-expanded={searchOpen}
          aria-controls="header-search"
          onClick={() => setSearchOpen(true)}
        >
          <IconSearch size={21} stroke={1.7} aria-hidden="true" />
        </button>
        <button type="button" className="stream-header-search-back" aria-label="Close search" onClick={closeSearch}>
          <IconArrowLeft size={21} stroke={1.7} aria-hidden="true" />
        </button>
        <div
          ref={searchRef}
          id="header-search"
          className="stream-header-search"
          onKeyDown={(event) => {
            if (event.key === "Escape" && searchOpen) closeSearch();
          }}
        >
          <MediaSearch
            key={initialQuery ?? ""}
            initialQuery={initialQuery}
            size="compact"
          />
        </div>
        <Link
          href="/watchlist"
          className="stream-header-watchlist"
          aria-label={`Watchlist${items.length ? `, ${items.length} saved ${items.length === 1 ? "title" : "titles"}` : ""}`}
          aria-current={pathname === "/watchlist" ? "page" : undefined}
        >
          <BookmarkIcon size={20} stroke={1.6} aria-hidden="true" />
        </Link>
      </div>
      {error && <p role="alert" className="watchlist-error">{error}</p>}
    </header>
  );
}
