"use client";

import { useEffect } from "react";

/** Show focus outlines after Tab navigation, until the next pointer interaction.
 * Typing and playback shortcuts should not outline a previously clicked control.
 */
export function TabFocus() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.focusNavigation = "pointer";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        root.dataset.focusNavigation = "tab";
      }
    };
    const onPointerDown = () => { root.dataset.focusNavigation = "pointer"; };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      delete root.dataset.focusNavigation;
    };
  }, []);
  return null;
}
