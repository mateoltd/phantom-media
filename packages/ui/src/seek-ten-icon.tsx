"use client";

import { useEffect, useRef } from "react";
import { ArrowUUpLeft, ArrowUUpRight } from "@phosphor-icons/react/ssr";

export function SeekTenIcon({ direction, feedbackId }: { direction: "back" | "forward"; feedbackId?: number }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const icon = iconRef.current?.querySelector("svg");
    if (!icon) return;
    // Restart from the current pose so held keys and rapid clicks stay smooth.
    // The SVG stays mounted; only its transform changes.
    const from = getComputedStyle(icon).transform;
    animationRef.current?.cancel();
    if (feedbackId === undefined || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animationRef.current = icon.animate([
      { transform: from },
      { transform: `translateX(${direction === "back" ? -4 : 4}px) scale(0.9)`, offset: 0.3 },
      { transform: "translateX(0) scale(1)" },
    ], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [direction, feedbackId]);

  useEffect(() => () => animationRef.current?.cancel(), []);

  const Icon = direction === "back" ? ArrowUUpLeft : ArrowUUpRight;
  return (
    <span ref={iconRef} className="stage-seek-icon" data-direction={direction} data-seeking={feedbackId !== undefined} aria-hidden="true">
      <Icon weight="bold" size={22.8} />
    </span>
  );
}
