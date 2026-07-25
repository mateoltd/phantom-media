"use client";

import { useEffect } from "react";

let openModals = 0;
let releaseScroll: (() => void) | null = null;

/**
 * `html` carries `overflow-x: clip`, which stops `body { overflow: hidden }`
 * from ever reaching the viewport, so the lock has to be set on the root
 * element as well. Losing the scrollbar widens the page, so the width it took
 * is handed back as padding to keep the layout still.
 */
function lockPageScroll(): void {
  openModals += 1;
  if (openModals > 1) return;

  const root = document.documentElement;
  const { body } = document;
  const scrollbarWidth = window.innerWidth - root.clientWidth;
  const previous = {
    rootOverflow: root.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
  };

  root.style.overflow = "hidden";
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  releaseScroll = () => {
    root.style.overflow = previous.rootOverflow;
    body.style.overflow = previous.bodyOverflow;
    body.style.paddingRight = previous.bodyPaddingRight;
  };
}

function unlockPageScroll(): void {
  openModals = Math.max(0, openModals - 1);
  if (openModals > 0) return;

  releaseScroll?.();
  releaseScroll = null;
}

export function useModalBehavior(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    lockPageScroll();
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      unlockPageScroll();
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);
}
