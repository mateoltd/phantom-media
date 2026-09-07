"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/** One-shot reveal. Content stays visible without JS or with reduced motion. */
export function MotionReveal(props: ComponentProps<"section">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || preference.matches || !("IntersectionObserver" in window)) return;
    const animations: Animation[] = [];
    const stop = () => animations.forEach((animation) => animation.cancel());
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      if (preference.matches) return;
      const targets = Array.from(root.querySelectorAll<HTMLElement>(".browse-heading, .stream-poster"));
      // Batch geometry reads before animation writes; skip offscreen posters.
      const visible = targets.filter((target) => {
        const rect = target.getBoundingClientRect();
        return rect.right > 0 && rect.left < window.innerWidth;
      }).slice(0, 9);
      visible.forEach((target, index) => {
        animations.push(target.animate(
          [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 420, delay: index * 35, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
        ));
      });
    }, { threshold: 0.08 });
    observer.observe(root);
    preference.addEventListener("change", stop);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", stop);
      stop();
    };
  }, []);

  return <section ref={ref} {...props} />;
}
