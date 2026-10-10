"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ShareNetwork, X } from "@phosphor-icons/react/ssr";
import { Button, IconButton } from "@phantom/ui";
import { buildVodPath } from "@/lib/validation";

export function ShareButton({ vodId, currentTime, iconOnly = false }: { vodId: string; currentTime?: number; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  useEffect(() => {
    if (!link) return;
    inputRef.current?.focus(); inputRef.current?.select();
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setLink(""); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setLink(""); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [link]);

  async function share() {
    const url = new URL(buildVodPath(vodId), window.location.origin);
    const position = currentTime ?? 0;
    url.searchParams.set("t", String(Math.max(0, Math.floor(Number.isFinite(position) ? position : 0))));
    setLink("");
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
    } catch { setLink(url.toString()); }
  }

  return <div ref={rootRef} className="twitch-share">
    <Button ref={triggerRef} variant="secondary" onClick={() => void share()} aria-label={copied ? "Link copied" : "Share video"} aria-expanded={Boolean(link)} data-copied={copied} className={`twitch-share-button ${iconOnly ? "twitch-rail-action" : "twitch-share-trigger"}`}>
      <span className="twitch-share-icon t-icon-swap" data-state={copied ? "b" : "a"} aria-hidden="true"><span className="t-icon" data-icon="a"><ShareNetwork size={iconOnly ? 21 : 12} /></span><span className="t-icon" data-icon="b"><Check size={iconOnly ? 21 : 12} /></span></span>
      {!iconOnly && <span className="twitch-share-label" data-copied={copied} aria-hidden="true"><span data-label="share">Share</span><span data-label="copied">Copied</span></span>}
      <span className="sr-only" role="status">{copied ? "Link copied" : ""}</span>
    </Button>
    {link && <div className={`twitch-action-popover ${iconOnly ? "twitch-rail-popover" : ""}`}><header><label htmlFor={inputId}>Copy video link</label><IconButton label="Close share" size="sm" onClick={() => { setLink(""); triggerRef.current?.focus(); }}><X size={16} /></IconButton></header><input id={inputId} ref={inputRef} readOnly value={link} onFocus={event => event.currentTarget.select()} className="twitch-share-link" /><p className="twitch-download-note">Copy the selected link to share this moment.</p></div>}
  </div>;
}
