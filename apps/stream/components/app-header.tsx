"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Logo, Wordmark } from "@phantom/ui";
import { MediaSearch } from "@/components/media-search";

interface AppHeaderProps {
  /**
   * Lifts the bar out of the flow so the artwork below runs to the top of the
   * window, and replaces its background with a gradient until the page moves.
   * A filled strip laid across a photograph cuts it in half.
   */
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
      className={`z-40 transition-colors duration-300 ${
        floating ? "fixed inset-x-0 top-0" : "sticky top-0"
      } ${
        solid
          ? "border-b border-border/70 bg-bg/85 backdrop-blur-xl"
          : "header-scrim border-b border-transparent"
      }`}
    >
      {/* Three columns, the outer two equal: an `auto` column on the left and
          an empty one on the right centre the field in what is left over, not
          in the window.

          The bar is deliberately short. Every pixel of it is a pixel the stage
          below does not get, and on a laptop the picture clearing the fold or
          not is decided in the last twenty. Sixteen of padding around a 44px
          field puts it at 61 including the rule — between YouTube's 56 and
          Netflix's 68, which is the range this can live in without reading as
          a toolbar. */}
      <div className="app-shell flex items-center gap-x-3 py-1.5 sm:gap-x-6 sm:py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link
          href="/"
          aria-label="Phantom Stream home"
          className="shrink-0 justify-self-start"
        >
          {/* The name goes, the mark stays. Together they are about 185px
              wide, which on a handset is most of the row the search field
              needs — so the field was taking a second row, and the whole bar
              cost ninety-odd pixels of every page. The mark alone is 44 and
              they fit on one line. */}
          <Logo size={34} tone="chalk" className="h-6 w-auto sm:hidden" />
          <Wordmark service="Stream" tone="chalk" className="hidden sm:flex" />
        </Link>

        <div className="min-w-0 flex-1 lg:w-[min(46vw,560px)] lg:flex-none">
          <MediaSearch initialQuery={initialQuery} size="compact" />
        </div>

        <div className="hidden lg:block" />
      </div>
    </header>
  );
}
