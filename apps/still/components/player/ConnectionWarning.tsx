"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Warning } from "@phosphor-icons/react/ssr";
import styles from "./ConnectionWarning.module.css";

export function ConnectionWarning() {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const warningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !warningRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  return (
    <div ref={warningRef} className={styles.warning}
      onPointerEnter={event => { if (event.pointerType !== "touch") setOpen(true); }}
      onPointerLeave={event => {
        if (event.pointerType !== "touch" && !warningRef.current?.contains(document.activeElement)) setOpen(false);
      }}>
      <span className="sr-only" role="status">Connection to Twitch is unstable.</span>
      <button type="button" className={styles.trigger} aria-label="Unstable connection to Twitch"
        aria-describedby={open ? hintId : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}>
        <Warning size={18} weight="regular" aria-hidden="true" />
      </button>
      <div id={hintId} role="tooltip" aria-hidden={!open} className={styles.hint} data-open={open}>
        <strong>Unstable connection</strong>
        <p>Your connection or Twitch may be slowing playback. Try Automatic quality.</p>
      </div>
    </div>
  );
}
