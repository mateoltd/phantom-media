"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import { MediaHeader, Wordmark } from "@phantom/ui";
import { TwitchSearch } from "./TwitchSearch";

export function GlobalSearch() {
  const pathname = usePathname();
  return <MediaHeader
    key={pathname}
    routeKey={pathname}
    floating={false}
    brand={<Link href="/" aria-label="Phantom Twitch home">
      <Wordmark service="Twitch" tone="chalk" className="hidden sm:flex" />
      <Wordmark tone="chalk" className="sm:hidden" />
    </Link>}
    // The home page opens on its own search, so the header copy stays out of the way until that one scrolls off.
    search={<div className="twitch-header-search" data-home={pathname === "/" || undefined}><TwitchSearch key={pathname} /></div>}
    actions={<Link href="/watch-history" className="media-header-action" aria-label="Watch history" title="Watch history" aria-current={pathname === "/watch-history" ? "page" : undefined}>
      <ClockCounterClockwise weight={pathname === "/watch-history" ? "bold" : "regular"} size={20} aria-hidden="true" />
    </Link>}
  />;
}
