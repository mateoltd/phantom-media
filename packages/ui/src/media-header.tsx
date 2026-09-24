"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";

/** Stream's navigation shell, shared by every media app. */
export function MediaHeader({ brand, search, actions, notice, floating = false, routeKey }: {
  brand: ReactNode;
  search: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  floating?: boolean;
  routeKey?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchId = useId();

  useEffect(() => {
    const update = () => {
      if (headerRef.current) headerRef.current.dataset.scrolled = String(window.scrollY > 16);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [routeKey]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector("input")?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <header ref={headerRef} className={`media-header ${floating ? "media-header-over-art" : ""}`} data-search-open={searchOpen}>
      <div className="app-shell media-header-inner">
        <div className="media-header-brand shrink-0 justify-self-start">{brand}</div>
        <button ref={triggerRef} type="button" data-open-search className="media-header-search-trigger" aria-label="Open search" aria-expanded={searchOpen} aria-controls={searchId} onClick={() => setSearchOpen(true)}>
          <Search size={21} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button type="button" className="media-header-search-back" aria-label="Close search" onClick={closeSearch}>
          <ArrowLeft size={21} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <div ref={searchRef} id={searchId} className="media-header-search" onKeyDown={(event) => {
          if (event.key === "Escape" && searchOpen) closeSearch();
        }}>{search}</div>
        <div className="media-header-actions">{actions}</div>
      </div>
      {notice}
    </header>
  );
}
