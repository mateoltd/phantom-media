"use client";

import { ViewTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquaresFour } from "@phosphor-icons/react/ssr";
import { MediaHeader } from "@phantom/ui";
import { StillSearch } from "./discovery/StillSearch";
import { HistoryMenu } from "./history/HistoryMenu";
import { StillLogo } from "./StillLogo";

export function GlobalSearch() {
  const pathname = usePathname();
  const home = pathname === "/";
  const search = <div className="still-header-search" data-home={home || undefined}><StillSearch key={pathname} /></div>;
  return <MediaHeader
    key={pathname}
    routeKey={pathname}
    floating={false}
    contentAligned
    brand={<Link href="/" aria-label="Still home" className="still-brand">
      <StillLogo />
    </Link>}
    // The home page has its own search, which docks here on scroll, so the header copy stays out of the way.
    // Everywhere else this field is the same element as that one: it arrives from the hero and returns to it.
    search={home ? search : <ViewTransition name="still-search" share="still-search" default="none">{search}</ViewTransition>}
    actions={<>
      <Link href="/categories" className="media-header-action still-nav-action" aria-label="Browse categories" title="Categories" aria-current={pathname === "/categories" ? "page" : undefined}>
        <SquaresFour size={20} aria-hidden="true" />
      </Link>
      <HistoryMenu />
    </>}
  />;
}
