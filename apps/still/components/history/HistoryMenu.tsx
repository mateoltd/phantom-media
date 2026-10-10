"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ClockCounterClockwise, Trash } from "@phosphor-icons/react/ssr";
import { IconButton, Switch } from "@phantom/ui";
import { historyPreview } from "@/lib/discovery/ranking";
import { forgetHistory, parseHistory, resourceKey, restoreHistory, setHistoryPaused, storedHistory, type ForgottenHistory, type HistoryEntry } from "@/lib/history";
import { ResumeTile } from "../discovery/HomeMediaTile";
import { useHistory, useHistoryPaused } from "./use-history";

// Reaching for the button fetches the pictures the panel will show, each once, so they are there when it opens.
const warmed = new Set<string>();
function warmThumbnails() {
  for (const entry of parseHistory(storedHistory())) {
    const image = historyPreview({ vodId: entry.resource.kind === "vod" ? entry.resource.id : "", previewThumbnailURL: entry.previewThumbnailURL });
    if (!image || warmed.has(image)) continue;
    warmed.add(image);
    new Image().src = image;
  }
}

/** The header's history button and the panel it opens over the page. */
export function HistoryMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!(event.target as Element).closest(".still-history")) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" className="media-header-action still-nav-action still-history" aria-label="Watch history" title="Watch history" aria-expanded={open} aria-controls={open ? panelId : undefined} onPointerEnter={warmThumbnails} onFocus={warmThumbnails} onClick={() => setOpen(!open)}>
      <ClockCounterClockwise weight={open ? "bold" : "regular"} size={20} aria-hidden="true" />
    </button>
    {open && createPortal(<HistoryPanel id={panelId} anchor={triggerRef} close={() => { setOpen(false); triggerRef.current?.focus(); }} />, document.body)}
  </>;
}

// The history is only read, and its missing details only asked for, while the panel is open.
function HistoryPanel({ id, anchor, close }: { id: string; anchor: RefObject<HTMLButtonElement | null>; close: () => void }) {
  const router = useRouter();
  const history = useHistory();
  const paused = useHistoryPaused();
  // What has been removed since the panel opened, so one control takes any of it back.
  const [forgotten, setForgotten] = useState<ForgottenHistory>([]);
  const forget = (matches?: (entry: HistoryEntry) => boolean) => setForgotten([...forgotten, ...forgetHistory(matches)]);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId(), pauseId = useId();

  // The panel lies over the whole page, the home search included, so it is placed from the button rather than inside the header.
  useLayoutEffect(() => {
    const place = () => {
      const box = anchor.current?.getBoundingClientRect(), panel = panelRef.current;
      if (!box || !panel) return;
      panel.style.setProperty("--anchor-top", `${box.bottom}px`);
      panel.style.setProperty("--anchor-right", `${box.right}px`);
      // A reserved scrollbar gutter shifts where a fixed box starts, so the edge is checked once it is placed.
      const drift = panel.getBoundingClientRect().right - box.right;
      if (drift) panel.style.setProperty("--anchor-right", `${box.right - drift}px`);
    };
    place();
    panelRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  return <div ref={panelRef} id={id} className="still-action-popover still-history still-history-panel" role="dialog" aria-labelledby={headingId} tabIndex={-1}>
    <header>
      <h2 id={headingId}>Watch history</h2>
      {forgotten.length ? <button type="button" className="still-history-action" onClick={() => { restoreHistory(forgotten); setForgotten([]); }}>Undo</button>
        : history.length > 0 && <button type="button" className="still-history-action" onClick={() => forget()}>Clear all</button>}
      <span className="sr-only" role="status">{forgotten.length ? `${forgotten.length} removed from history` : ""}</span>
    </header>
    {history.length ? <ul className="still-history-list">
      {history.map((entry) => <li key={resourceKey(entry.resource)}>
        <ResumeTile entry={entry} onSelect={(path) => { close(); router.push(path); }} compact />
        <IconButton size="sm" label={`Remove ${entry.title || entry.channel || "clip"} from history`} onClick={() => forget((item) => resourceKey(item.resource) === resourceKey(entry.resource))}><Trash size={16} /></IconButton>
      </li>)}
    </ul> : <p className="still-history-empty">{paused ? "History is paused. Nothing you watch is being saved." : "Videos you open are kept in this browser so you can pick up where you left off."}</p>}
    <footer>
      <span id={pauseId}>Pause history</span>
      <Switch checked={paused} onCheckedChange={setHistoryPaused} aria-labelledby={pauseId} />
    </footer>
  </div>;
}
