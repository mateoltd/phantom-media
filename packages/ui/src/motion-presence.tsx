"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Retain a closing overlay briefly, but remove its input and accessibility targets immediately. */
export function MotionPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [retained, setRetained] = useState(open);
  if (open && !retained) setRetained(true);

  useEffect(() => {
    if (open || !retained) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => setRetained(false), preference.matches ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [open, retained]);

  if (!open && !retained) return null;
  return (
    <div className="motion-presence" data-closing={!open} inert={!open} aria-hidden={!open || undefined}>
      {children}
    </div>
  );
}
