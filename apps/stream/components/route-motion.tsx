"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Animate committed navigation, never delay a route or remount the player. */
export function RouteMotion() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const previous = useRef({ pathname, search });

  useLayoutEffect(() => {
    const last = previous.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    previous.current = { pathname, search };
    if (
      (last.pathname === pathname && last.search === search) ||
      (last.pathname === pathname && pathname.startsWith("/watch/")) ||
      preference.matches
    ) return;

    // Opacity leaves fixed sheets, scroll restoration and anchor targets intact.
    const animation = document.querySelector("main")?.animate(
      [{ opacity: 0.35 }, { opacity: 1 }],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    const cancel = () => animation?.cancel();
    preference.addEventListener("change", cancel);
    return () => {
      preference.removeEventListener("change", cancel);
      cancel();
    };
  }, [pathname, search]);

  return null;
}
