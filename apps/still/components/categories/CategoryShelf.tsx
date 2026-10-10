"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { liveChannel, type CategoryDirectory } from "@/lib/categories";
import { RecommendedTile } from "../discovery/HomeMediaTile";
import { CategoryTile } from "./CategoryTile";

/**
 * One category as a row: its box art stays put while the streams leading it page sideways beside it.
 * Every stream came with the directory, so paging asks for nothing.
 */
export function CategoryShelf({ shelf }: { shelf: CategoryDirectory["featured"][number] }) {
  const strip = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  const measure = () => {
    const element = strip.current;
    if (!element) return;
    const next = { start: element.scrollLeft <= 1, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 };
    setEnds(current => current.start === next.start && current.end === next.end ? current : next);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const page = (direction: 1 | -1) => {
    const element = strip.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gap = parseFloat(getComputedStyle(element).columnGap || "0");
    element.scrollBy({ left: direction * (element.clientWidth + gap), behavior: reduced ? "auto" : "smooth" });
  };

  return <section className="still-category-shelf" aria-roledescription="carousel" aria-label={`Live in ${shelf.name}`}>
    <CategoryTile category={shelf} eager />
    <div className="still-category-strip-frame">
      <div className="still-category-strip" ref={strip} onScroll={measure}>
        {shelf.streams.map(stream => <RecommendedTile key={stream.id} channel={liveChannel(stream)} />)}
      </div>
      <button type="button" className="still-category-strip-step" data-side="start" hidden={ends.start} onClick={() => page(-1)} aria-label={`Earlier ${shelf.name} streams`}><CaretLeft size={16} weight="bold" /></button>
      <button type="button" className="still-category-strip-step" data-side="end" hidden={ends.end} onClick={() => page(1)} aria-label={`More ${shelf.name} streams`}><CaretRight size={16} weight="bold" /></button>
    </div>
  </section>;
}
