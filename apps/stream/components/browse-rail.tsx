"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PosterTile } from "@/components/poster-tile";
import { MotionReveal } from "@/components/motion-reveal";
import type { BrowseRow } from "@/lib/catalog";

export function BrowseRail({
  row,
  priority = false,
}: {
  row: BrowseRow;
  priority?: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const sync = () => {
      const next = {
        start: rail.scrollLeft < 2,
        end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
      };
      setEdges((previous) => previous.start === next.start && previous.end === next.end ? previous : next);
    };
    sync();
    rail.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [row.items.length]);

  const scroll = (direction: number) => {
    const rail = railRef.current;
    if (rail)
      rail.scrollBy({
        left: direction * rail.clientWidth * 0.8,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };

  return (
    <MotionReveal className="pt-8 sm:pt-10" aria-label={row.title}>
      <div className="app-shell browse-heading">
        <h2>{row.title}</h2>
        <div className="flex gap-2">
          <button
            className="rail-arrow"
            type="button"
            aria-label={`Previous ${row.title.toLowerCase()}`}
            disabled={edges.start}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="rail-arrow"
            type="button"
            aria-label={`More ${row.title.toLowerCase()}`}
            disabled={edges.end}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div ref={railRef} className="rail">
        {row.items.map((media, index) => (
          <PosterTile
            key={`${media.mediaType}-${media.id}`}
            media={media}
            priority={priority && index < 6}
          />
        ))}
      </div>
    </MotionReveal>
  );
}
