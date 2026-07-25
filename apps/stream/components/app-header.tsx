"use client";

import Link from "next/link";
import { Wordmark } from "@phantom/ui";
import { MediaSearch } from "@/components/media-search";

interface AppHeaderProps {
  /** The landing page prints the mark large in the hero, so it hides it here. */
  hideBrandOnDesktop?: boolean;
  initialQuery?: string;
}

export function AppHeader({
  hideBrandOnDesktop = false,
  initialQuery,
}: AppHeaderProps) {
  return (
    <header className="app-shell relative z-30 flex flex-wrap items-center gap-x-5 gap-y-3 pb-4 pt-5 lg:grid lg:grid-cols-[1fr_minmax(0,900px)_1fr]">
      <Link
        href="/"
        aria-label="Phantom Stream home"
        className={hideBrandOnDesktop ? "lg:hidden" : ""}
      >
        <Wordmark service="Stream" />
      </Link>

      <div className="order-last w-full min-w-0 lg:order-none lg:col-start-2 lg:w-auto">
        <MediaSearch initialQuery={initialQuery} />
      </div>

      <div className="ml-auto hidden shrink-0 lg:block lg:justify-self-end" />
    </header>
  );
}
