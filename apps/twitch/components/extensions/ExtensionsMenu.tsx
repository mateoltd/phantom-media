"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, CaretRight, DownloadSimple, PuzzlePiece, X } from "@phosphor-icons/react/ssr";
import { Artwork, Button, IconButton, ProgressRail, SearchField } from "@phantom/ui";
import type { ExtensionEntry } from "@/lib/extensions/contracts";
import { useExtensionAssets, useExtensions } from "./use-extensions";

/** An attached, non-modal browser. Catalog requests start only when opened. */
export function ExtensionsMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, close]);
  return <div ref={root} className="twitch-extensions-menu" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <IconButton ref={trigger} className="media-header-action twitch-nav-action" label="Extensions" title="Extensions" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><PuzzlePiece size={20} /></IconButton>
    {open && <section id={id} className="twitch-extensions-popover" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
      <header><h2 id={`${id}-title`}>Extensions</h2><IconButton label="Close extensions" size="sm" onClick={close}><X size={16} /></IconButton></header>
      <ExtensionBrowser />
    </section>}
  </div>;
}

function ExtensionBrowser() {
  const { entries, loading, error } = useExtensions();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExtensionEntry>();
  const back = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selectedId = useRef("");
  useEffect(() => {
    if (selected) back.current?.focus();
  }, [selected]);
  function returnToList() {
    setSelected(undefined);
    requestAnimationFrame(() => {
      const button = [...list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []].find(element => element.dataset.id === selectedId.current);
      button?.focus();
    });
  }
  if (selected) return <>
    <Button ref={back} variant="ghost" className="twitch-extension-back" onClick={returnToList}><ArrowLeft size={14} />All extensions</Button>
    <ExtensionDetails key={selected.catalogId} entry={selected} />
  </>;
  const filtered = entries.filter(entry => `${entry.name} ${entry.author}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <div className="twitch-extension-search"><SearchField autoFocus size="small" showSubmit={false} value={query} onValueChange={setQuery} onSubmit={() => {}} labels={{ placeholder: "Find an extension", submit: "Find an extension", working: "Searching…", suggestions: "Extensions", looking: "Searching…", clear: "Clear extension search" }} /></div>
    <div ref={list} className="twitch-extension-list" aria-busy={loading}>
      {loading && <p className="twitch-extension-message" role="status">Loading extensions…</p>}
      {error && <p className="twitch-extension-message" role="alert">{error}</p>}
      {!loading && !error && !filtered.length && <p className="twitch-extension-message" role="status">{query ? "No matching extensions." : "No extensions available."}</p>}
      {filtered.map(entry => <Button key={entry.catalogId} data-id={entry.catalogId} variant="ghost" className="twitch-extension-entry" onClick={() => { selectedId.current = entry.catalogId; setSelected(entry); }}>
        <ExtensionIcon entry={entry} /><span className="twitch-extension-copy"><strong>{entry.name}</strong><span>{entry.author || "Independent extension"}</span></span><CaretRight size={14} aria-hidden="true" />
      </Button>)}
    </div>
    {!loading && !error && <p className="twitch-extension-footnote">Browse the current public catalog.</p>}
  </>;
}

function ExtensionIcon({ entry, detail = false }: { entry: ExtensionEntry; detail?: boolean }) {
  return <span className="twitch-extension-mark" data-size={detail ? "detail" : "list"} aria-hidden="true">
    <Artwork src={entry.iconUrl} sizes={detail ? "40px" : "32px"} fallback={<PuzzlePiece size={detail ? 24 : 18} />} />
  </span>;
}

function ExtensionDetails({ entry }: { entry: ExtensionEntry }) {
  return <div className="twitch-extension-details">
    <div className="twitch-extension-identity">
      <ExtensionIcon entry={entry} detail />
      <div><h3>{entry.name}</h3><p>{entry.author || "Independent extension"}</p></div>
    </div>
    {entry.summary && <p className="twitch-extension-description">{entry.summary}</p>}
    <span className="twitch-extension-version">Version {entry.version}</span>
    <ExtensionFiles clientId={entry.clientId} />
  </div>;
}

function ExtensionFiles({ clientId }: { clientId: string }) {
  const { collection, loading, error, collect, cancel, save } = useExtensionAssets(clientId);
  return <div className="twitch-extension-download">
    {error && <p role="alert">{error}</p>}
    {loading && <>
      <ProgressRail percent={0} label="Preparing extension download" indeterminate slim />
      <div className="twitch-extension-download-row"><span role="status">Preparing download…</span><Button variant="ghost" onClick={cancel}>Cancel</Button></div>
    </>}
    {!loading && collection && <>
      <div className="twitch-extension-download-row">
        <span>{collection.assets.length} files<span className="twitch-extension-size">{(collection.totalBytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</span></span>
        <Button variant="secondary" onClick={save}><DownloadSimple size={15} />Save files</Button>
      </div>
      <p className="twitch-extension-footnote">JSON bundle of public files.
        {collection.failures.length ? ` ${collection.failures.length} ${collection.failures.length === 1 ? "file" : "files"} unavailable.` : ""}
        {collection.stop === "budget" ? " Collection size limit reached." : ""}
      </p>
    </>}
    {!loading && !collection && <>
      <Button variant="secondary" onClick={() => void collect()}><DownloadSimple size={15} />Prepare download</Button>
      <p className="twitch-extension-footnote">Save public files from this extension. Interactive panels aren’t installed in the player.</p>
    </>}
  </div>;
}
