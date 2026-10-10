"use client";

import { useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ChannelAvatar } from "../ChannelAvatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { buildChannelPath } from "@/lib/validation";

export function WatchRail({ channel, displayName, image, verified = false, broadcastType, actions }: {
  channel: string;
  displayName?: string;
  image?: string;
  verified?: boolean;
  broadcastType: string;
  actions: ReactNode[];
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const label = displayName || channel;

  function hide() {
    if (!tipRef.current) return;
    tipRef.current.dataset.show = "false";
    tipRef.current.setAttribute("aria-hidden", "true");
  }

  function show(target: EventTarget) {
    if (!(target instanceof Element)) return;
    const trigger = target.closest<HTMLElement>(".still-rail-action");
    const tip = tipRef.current;
    const text = textRef.current;
    const group = groupRef.current;
    if (!trigger || !tip || !text || !group) return;
    text.textContent = trigger.dataset.tooltip || trigger.getAttribute("aria-label") || "";
    const cs = getComputedStyle(tip);
    const width = Math.ceil(text.scrollWidth + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));
    const g = group.getBoundingClientRect();
    const r = trigger.getBoundingClientRect();
    const showing = tip.dataset.show === "true";
    if (!showing) tip.style.transition = "none";
    tip.style.width = `${width}px`;
    tip.style.setProperty("--tt-x", `${r.left - g.left - width - 12}px`);
    tip.style.setProperty("--tt-y", `${r.top - g.top + (r.height - tip.offsetHeight) / 2}px`);
    if (!showing) {
      void tip.offsetWidth;
      tip.style.transition = "";
    }
    tip.dataset.show = "true";
    tip.setAttribute("aria-hidden", "false");
  }

  return (
    <div className="still-watch-rail t-tt-group" role="group" aria-label="Video actions" ref={groupRef}
      onPointerOver={(event) => { if (event.pointerType !== "touch") show(event.target); }}
      onPointerLeave={hide} onFocus={(event) => show(event.target)} onBlur={hide}
      onClick={hide} onKeyDown={(event) => { if (event.key === "Escape") hide(); }}>
      <Link href={buildChannelPath(channel)} className="still-rail-action still-rail-avatar"
        aria-label={`Open ${label} channel${verified ? ", verified" : ""}${broadcastType === "Live" ? ", live now" : ""}`} data-tooltip={`${label}: ${broadcastType}`} aria-describedby={tipId}>
        <ChannelAvatar image={image} />
        {verified && <span className="still-rail-verified"><VerifiedBadge size={14} /></span>}
        {broadcastType === "Live" && <span className="still-rail-live-badge" aria-hidden="true">LIVE</span>}
      </Link>
      <div className="still-rail-controls">
        <div className="still-rail-slot">{actions[0]}</div>
        <div className="still-rail-secondary">
          {actions.slice(1).map((action, index) => <div className="still-rail-slot" key={index}>{action}</div>)}
        </div>
      </div>
      <span className="t-tt" id={tipId} ref={tipRef} role="tooltip" aria-hidden="true" data-show="false">
        <span className="t-tt-text" ref={textRef} />
      </span>
    </div>
  );
}
