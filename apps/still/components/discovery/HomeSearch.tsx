"use client";

import { useEffect, useRef, useState, ViewTransition } from "react";
import { StillSearch } from "./StillSearch";

const INPUT_ID = "home-search-input";

/**
 * The home page's own search, and the only one on the page. It scrolls with the page until it reaches the header,
 * then stays in the header's search slot at the header's size, so there is never a second field to swap to.
 * Leaving the page, it travels to the header's field as one element (see ::view-transition-group in still.css).
 */
export function HomeSearch() {
  const root = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const element = root.current;
    const header = document.querySelector<HTMLElement>(".media-header");
    const slot = header?.querySelector<HTMLElement>(".media-header-search");
    if (!element || !header || !slot) return;
    const page = document.documentElement;
    // Narrow screens have no field in the header, only a button that opens one, so there is nothing to dock into.
    const narrow = window.matchMedia("(max-width: 640px)");
    let top = 0;

    const track = () => {
      const box = element.getBoundingClientRect();
      if (narrow.matches) {
        setDocked(false);
        page.dataset.homeSearch = box.bottom <= header.offsetHeight ? "hidden" : "visible";
        return;
      }
      page.dataset.homeSearch = "visible";
      setDocked(box.top <= top + 0.5);
    };
    const measure = () => {
      if (!narrow.matches) {
        const target = slot.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        top = target.top - header.getBoundingClientRect().top;
        element.style.setProperty("--dock-top", `${top}px`);
        element.style.setProperty("--dock-width", `${target.width}px`);
        element.style.setProperty("--dock-shift", `${target.left + target.width / 2 - (box.left + box.width / 2)}px`);
      }
      track();
    };

    const frame = requestAnimationFrame(measure);
    const resized = new ResizeObserver(measure);
    resized.observe(header);
    const prompt = element.previousElementSibling;
    if (prompt) resized.observe(prompt);
    window.addEventListener("scroll", track, { passive: true });
    // Typing is the reason to be here. Touch screens are left alone: focusing would throw a keyboard over the page.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) document.getElementById(INPUT_ID)?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      window.removeEventListener("scroll", track);
      page.dataset.homeSearch = "hidden";
    };
  }, []);

  return <div ref={root} className="still-home-search" role="search" aria-labelledby="home-search-heading" data-docked={docked || undefined}>
    <ViewTransition name="still-search" share="still-search" default="none">
      <div className="still-home-search-field"><StillSearch inputId={INPUT_ID} size={docked ? "compact" : "default"} /></div>
    </ViewTransition>
  </div>;
}
