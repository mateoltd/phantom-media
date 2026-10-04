"use client";

import { useEffect, useRef } from "react";
import { TwitchSearch } from "./TwitchSearch";

const INPUT_ID = "home-search-input";

/**
 * The home page's own search. It tells the document whether it is on screen, so the header can keep its copy
 * hidden until this one has scrolled away and there is never a second search field in view.
 */
export function HomeSearch() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const header = document.querySelector<HTMLElement>(".media-header");
    const observer = new IntersectionObserver(([entry]) => {
      document.documentElement.dataset.homeSearch = entry.isIntersecting ? "visible" : "hidden";
    }, { rootMargin: `-${header?.offsetHeight ?? 0}px 0px 0px 0px` });
    observer.observe(element);
    // Typing is the reason to be here. Touch screens are left alone: focusing would throw a keyboard over the page.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) document.getElementById(INPUT_ID)?.focus({ preventScroll: true });
    return () => { observer.disconnect(); document.documentElement.dataset.homeSearch = "hidden"; };
  }, []);

  return <div ref={root} className="twitch-home-search"><TwitchSearch inputId={INPUT_ID} size="default" /></div>;
}
