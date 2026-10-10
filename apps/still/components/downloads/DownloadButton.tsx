"use client";

import { useEffect, useId, useRef } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react/ssr";
import { Button, IconButton, ProgressRail } from "@phantom/ui";
import type { MediaVariant } from "@/lib/contracts";
import { useDownload } from "./use-download";
import { StillLoader } from "../StillLoader";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function DownloadButton({ qualities, channel, vodId, iconOnly = false, clipSlug }: {
  qualities: MediaVariant[]; channel: string; vodId: string; iconOnly?: boolean; clipSlug?: string;
}) {
  const { state, setState, prepare, save, cancel } = useDownload(channel, vodId, clipSlug);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const open = ["picking", "preparing", "ready", "error"].includes(state.status);
  const downloading = state.status === "downloading";
  const percent = downloading && state.progress.total ? Math.round(state.progress.downloaded / state.progress.total * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) cancel(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); cancel(); triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open, cancel]);
  useEffect(() => {
    if (state.status === "picking" || state.status === "ready" || state.status === "error") rootRef.current?.querySelector<HTMLButtonElement>("[data-download-option]")?.focus({ preventScroll: true });
  }, [state.status]);

  return <div ref={rootRef} className="still-download">
    <Button ref={triggerRef} variant="secondary" disabled={!qualities.length} className={iconOnly ? `still-rail-action ${downloading ? "still-rail-downloading" : ""}` : "still-download-trigger"} aria-label={downloading ? `Cancel download (${percent}%)` : "Download video"} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => downloading || open ? cancel() : setState({ status: "picking" })}>
      {downloading && iconOnly && <svg className="still-download-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 22 22)" /></svg>}
      {downloading ? <X size={iconOnly ? 21 : 12} /> : <DownloadSimple size={iconOnly ? 21 : 12} />}
      {!iconOnly && (downloading ? `Cancel (${percent}%)` : "Download")}
      {downloading && iconOnly && <span className="sr-only" role="status">Downloading {state.qualityName}, {percent}%</span>}
    </Button>
    {downloading && !iconOnly && <div className="still-download-progress">{state.progress.total ? <ProgressRail percent={percent} label="Download progress" slim /> : <StillLoader label="Downloading…" variant="compact" />}<span className="still-resource-number">{formatBytes(state.progress.bytes)}</span></div>}
    {open && <div id={panelId} className={`still-action-popover still-download-picker ${iconOnly ? "still-rail-popover" : ""}`} role="group" aria-label="Download options">
      <header><span>{state.status === "ready" ? "Ready to save" : "Download"}</span><IconButton label="Close download" size="sm" onClick={() => { cancel(); triggerRef.current?.focus(); }}><X size={16} /></IconButton></header>
      {state.status === "picking" && <div className="still-download-options">{qualities.map(variant => <Button key={variant.key} data-download-option variant="ghost" onClick={() => void prepare(variant)}><span>{variant.name}</span><span className="still-download-option-detail">{variant.kind === "audio" ? "Audio" : variant.resolution ?? ""}</span></Button>)}</div>}
      {state.status === "preparing" && <div className="still-download-state"><StillLoader label={`Preparing ${state.qualityName}…`} variant="compact" /></div>}
      {state.status === "ready" && <div className="still-download-state"><p>{state.prepared.variant.name}</p>{state.prepared.playlist && !state.prepared.playlist.complete && <p className="still-download-note">Saves the available recording window.</p>}<Button data-download-option onClick={() => { triggerRef.current?.focus(); void save(); }}><DownloadSimple size={16} />Save file</Button></div>}
      {state.status === "error" && <div className="still-download-state"><p role="alert">{state.message}</p><Button data-download-option variant="ghost" onClick={() => setState({ status: "picking" })}>Choose a quality</Button></div>}
    </div>}
  </div>;
}
