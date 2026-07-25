"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Wordmark } from "@phantom/ui";
import { MediaSearch } from "@/components/media-search";

interface AppHeaderProps {
  /** Lets the hero behind it show through until the page is scrolled. */
  floating?: boolean;
  initialQuery?: string;
}

const LIFT_AFTER_PX = 24;

function subscribeToScroll(listener: () => void): () => void {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}

const scrolled = () => window.scrollY > LIFT_AFTER_PX;
/** The server renders the top of the page by definition. */
const atTopOnServer = () => false;

export function AppHeader({ floating = false, initialQuery }: AppHeaderProps) {
  const lifted = useSyncExternalStore(
    subscribeToScroll,
    scrolled,
    atTopOnServer
  );
  const solid = !floating || lifted;

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 ${
        solid
          ? "border-b border-border/70 bg-bg/85 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="app-shell flex flex-wrap items-center gap-x-6 gap-y-3 py-3.5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Link href="/" aria-label="Phantom Stream home" className="shrink-0">
          <Wordmark service="Stream" />
        </Link>

        <div className="order-last w-full min-w-0 lg:order-none lg:mx-auto lg:w-full lg:max-w-[560px]">
          <MediaSearch initialQuery={initialQuery} />
        </div>

        <div className="hidden shrink-0 lg:block" />
      </div>
    </header>
  );
}
