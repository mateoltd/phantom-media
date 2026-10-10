"use client";

import { ViewTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockCounterClockwise, SquaresFour } from "@phosphor-icons/react/ssr";
import { MediaHeader, Wordmark } from "@phantom/ui";
import { TwitchSearch } from "./discovery/TwitchSearch";

export function GlobalSearch() {
  const pathname = usePathname();
  const home = pathname === "/";
  const search = <div className="twitch-header-search" data-home={home || undefined}><TwitchSearch key={pathname} /></div>;
  return <MediaHeader
    key={pathname}
    routeKey={pathname}
    floating={false}
    contentAligned
    brand={<Link href="/" aria-label="Phantom Twitch home">
      <Wordmark service="Twitch" tone="chalk" className="twitch-nav-wordmark hidden sm:flex" />
      <Wordmark tone="chalk" className="twitch-nav-wordmark sm:hidden" />
    </Link>}
    // The home page has its own search, which docks here on scroll, so the header copy stays out of the way.
    // Everywhere else this field is the same element as that one: it arrives from the hero and returns to it.
    search={home ? search : <ViewTransition name="twitch-search" share="twitch-search" default="none">{search}</ViewTransition>}
    actions={<>
      <Link href="/categories" className="media-header-action twitch-nav-action" aria-label="Browse categories" title="Categories" aria-current={pathname === "/categories" ? "page" : undefined}>
        <SquaresFour size={20} aria-hidden="true" />
      </Link>
      <Link href="/watch-history" className="media-header-action twitch-nav-action" aria-label="Watch history" title="Watch history" aria-current={pathname === "/watch-history" ? "page" : undefined}>
        <ClockCounterClockwise weight={pathname === "/watch-history" ? "bold" : "regular"} size={20} aria-hidden="true" />
      </Link>
    </>}
  />;
}
