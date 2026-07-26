"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Logo, Wordmark } from "@phantom/ui";
import { MediaSearch } from "@/components/media-search";

interface AppHeaderProps {
  floating?: boolean;
  initialQuery?: string;
}

const LIFT_AFTER_PX = 24;

function subscribeToScroll(listener: () => void): () => void {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}

const scrolled = () => window.scrollY > LIFT_AFTER_PX;
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
      className={`z-40 h-[var(--app-header-h)] transition-colors duration-300 ${
        floating ? "fixed inset-x-0 top-0" : "sticky top-0"
      } ${
        solid
          ? "border-b border-border/70 bg-bg/85 backdrop-blur-xl"
          : "header-scrim border-b border-transparent"
      }`}
    >
      <div className="app-shell flex h-full items-center gap-x-3 py-1.5 sm:gap-x-6 sm:py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link
          href="/"
          aria-label="Phantom Stream home"
          className="shrink-0 justify-self-start"
        >
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
