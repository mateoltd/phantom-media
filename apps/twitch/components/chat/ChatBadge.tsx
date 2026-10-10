"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ChatBadge({ title, imageUrl }: { title: string; imageUrl: string }) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }

  function show() {
    cancelHide();
    setOpen(true);
  }

  function hideSoon() {
    cancelHide();
    hideTimer.current = setTimeout(() => {
      if (document.activeElement !== triggerRef.current) setOpen(false);
    }, 100);
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const rect = trigger.getBoundingClientRect();
      const list = trigger.closest(".twitch-chat-messages")?.getBoundingClientRect();
      if (rect.bottom <= Math.max(0, list?.top ?? 0) || rect.top >= Math.min(window.innerHeight, list?.bottom ?? window.innerHeight)) {
        setOpen(false);
        return;
      }
      const inset = 8;
      const left = Math.max(inset, Math.min(rect.left + rect.width / 2 - tooltip.offsetWidth / 2, window.innerWidth - tooltip.offsetWidth - inset));
      const above = rect.top - tooltip.offsetHeight - inset;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${above >= inset ? above : rect.bottom + inset}px`;
      tooltip.dataset.show = "true";
    }
    updatePosition();

    function dismiss() { setOpen(false); }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    }
    // A portal keeps the tooltip outside the sidebar's clipping/transform layers.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, title]);

  return <>
    <span ref={triggerRef} className="twitch-chat-badge" tabIndex={0} role="img" aria-label={title}
      aria-describedby={open ? tooltipId : undefined}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") show(); }}
      onPointerLeave={hideSoon} onFocus={show} onBlur={() => { cancelHide(); setOpen(false); }}>
      <Image unoptimized src={imageUrl} alt="" width={18} height={18} loading="lazy" />
    </span>
    {open && createPortal(<span ref={tooltipRef} id={tooltipId} role="tooltip"
      className="t-tt twitch-chat-badge-tooltip" data-show="false"
      onPointerEnter={cancelHide} onPointerLeave={hideSoon}>{title}</span>, document.body)}
  </>;
}
