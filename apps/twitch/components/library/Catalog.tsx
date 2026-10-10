"use client";

import Link from "next/link";
import { Suspense, use, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button, MediaTile, StyledSelect } from "@phantom/ui";
import type { BroadcastType, CatalogItem, CatalogScope, CatalogView, ClipPeriod, SliceReceipt } from "@/lib/catalog/contracts";
import { CLIP_LANGUAGES, DEFAULT_VIEW, VIDEO_LANGUAGES, VIEW_SIZE, sliceKey, viewSlice } from "@/lib/catalog/slices";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { ResourceNotice } from "../resources/ResourcePage";
import { useCatalog } from "./use-catalog";

export interface CatalogPanel { id: string; label: string; content: ReactNode }

const TYPE_LABELS: Record<BroadcastType, string> = { ARCHIVE: "Past broadcasts", HIGHLIGHT: "Highlights", UPLOAD: "Uploads", PAST_PREMIERE: "Past premieres" };
const TYPE_OPTIONS = [{ value: "", label: "All videos" }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))];
const SORT_OPTIONS = [{ value: "TIME", label: "Recent" }, { value: "VIEWS", label: "Popular" }];
const PERIOD_LABELS: Record<ClipPeriod, string> = { LAST_DAY: "Past day", LAST_WEEK: "Past week", LAST_MONTH: "Past month", ALL_TIME: "All time" };
const PERIOD_OPTIONS = Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }));
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languagesFor = (media: CatalogView["media"]): readonly string[] => media === "vod" ? VIDEO_LANGUAGES : CLIP_LANGUAGES;
/** Rows are revealed from what is already loaded, so showing more never costs a request. */
const STEP = 24;

/**
 * Videos and clips for a channel or a category, plus any extra panels the page adds as tabs.
 * `initial` is the default view as read by the server, so the first screen needs no request from the browser.
 * `lazy` holds the first request until the catalog is near the screen, for pages where it sits far below.
 */
export function Catalog({ scope, initial, panels = [], lazy = false }: { scope: CatalogScope; initial?: Promise<SliceReceipt | null>; panels?: CatalogPanel[]; lazy?: boolean }) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const [near, setNear] = useState(!lazy);
  useEffect(() => {
    const element = root.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [panel, setPanel] = useState<string>();
  const active = panel ?? view.media;
  const tabs = [{ id: "vod", label: "Videos" }, { id: "clip", label: "Clips" }, ...panels];

  const open = (tab: string) => {
    if (tab !== "vod" && tab !== "clip") return setPanel(tab);
    setPanel(undefined);
    // A language Twitch has no clips axis for would be a request that cannot succeed.
    if (tab !== view.media) setView({ ...view, media: tab, language: view.language && languagesFor(tab).includes(view.language) ? view.language : undefined });
  };
  // Arrow keys move between tabs without opening them, so passing over one never starts a request.
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + move + buttons.length) % buttons.length].focus();
  };

  return <section className="twitch-catalog" ref={root}>
    <div className="twitch-catalog-bar">
      <div className="twitch-catalog-tabs" role="tablist" aria-label="Sections" onKeyDown={step}>
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-selected={active === tab.id}
          aria-controls={`${id}-${tab.id === "vod" || tab.id === "clip" ? "results" : tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => open(tab.id)}>{tab.label}</button>)}
      </div>
      {!panel && <div className="twitch-catalog-controls">
        {scope.kind === "channel" && view.media === "vod" && <StyledSelect variant="quiet" label="Video type" value={view.type ?? ""} options={TYPE_OPTIONS}
          onValueChange={value => setView({ ...view, type: (value || undefined) as BroadcastType | undefined })} />}
        {scope.kind === "game" && <StyledSelect variant="quiet" label="Language" value={view.language ?? ""}
          options={[{ value: "", label: "All languages" }, ...languagesFor(view.media).map(value => ({ value, label: languageNames.of(value) ?? value }))]}
          onValueChange={value => setView({ ...view, language: value || undefined })} />}
        {view.media === "vod"
          ? <StyledSelect variant="quiet" label="Sort" value={view.sort} options={SORT_OPTIONS} onValueChange={value => setView({ ...view, sort: value as CatalogView["sort"] })} />
          : <StyledSelect variant="quiet" label="Period" value={view.period} options={PERIOD_OPTIONS} onValueChange={value => setView({ ...view, period: value as ClipPeriod })} />}
      </div>}
    </div>
    <div className="twitch-catalog-panel" role="tabpanel" id={`${id}-results`} aria-labelledby={`${id}-tab-${view.media}`} hidden={Boolean(panel)}>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogResults scope={scope} view={view} initial={initial} enabled={near} onClips={() => open("clip")} />
      </Suspense>
    </div>
    {panels.map(extra => <div key={extra.id} className="twitch-catalog-panel" role="tabpanel" id={`${id}-${extra.id}`} aria-labelledby={`${id}-tab-${extra.id}`} hidden={panel !== extra.id}>{extra.content}</div>)}
  </section>;
}

function CatalogResults({ scope, view, initial, enabled, onClips }: { scope: CatalogScope; view: CatalogView; initial?: Promise<SliceReceipt | null>; enabled: boolean; onClips: () => void }) {
  const seed = initial ? use(initial) : null;
  const slice = viewSlice(scope, view);
  const key = sliceKey(slice);
  const { receipt, error, retry } = useCatalog(slice, seed, enabled);
  const [revealed, setRevealed] = useState<Record<string, number>>({});

  if (error) return <div className="twitch-catalog-notice"><ResourceNotice title="This didn’t load" error>{error}</ResourceNotice><Button variant="ghost" onClick={retry}>Try again</Button></div>;
  if (!receipt) return <CatalogSkeleton />;
  if (!receipt.items.length) return <div className="twitch-catalog-notice">
    <Empty scope={scope} view={view} />
    {/* A channel that keeps no videos is often still clipped, so the empty tab points somewhere. */}
    {scope.kind === "channel" && view.media === "vod" && !view.type && <Button variant="ghost" onClick={onClips}>See clips</Button>}
  </div>;

  const count = revealed[key] ?? STEP;
  const hidden = receipt.items.length - count;
  const total = receipt.totalCount;
  return <>
    <div className="twitch-broadcast-grid">
      {receipt.items.slice(0, count).map((item, index) => <CatalogTile key={`${item.kind}:${item.id}`} item={item} scope={scope} eager={index < 4} />)}
    </div>
    {hidden > 0
      ? <div className="twitch-catalog-end"><Button variant="ghost" onClick={() => setRevealed({ ...revealed, [key]: count + STEP })}>Show more</Button></div>
      // Twitch pages no further than this. Say so, and say how to reach the rest.
      : total !== undefined && receipt.items.length >= VIEW_SIZE && total > receipt.items.length
        ? <p className="twitch-catalog-end">{view.sort === "TIME" ? "The latest" : "The most viewed"} {receipt.items.length} of {total.toLocaleString("en")} videos. {view.sort === "TIME" ? "Sort by Popular" : "Sort by Recent"} or pick a type to find others.</p>
        : null}
  </>;
}

function CatalogTile({ item, scope, eager }: { item: CatalogItem; scope: CatalogScope; eager: boolean }) {
  const date = formatDate(item.createdAt);
  return <Link className="media-tile-hit" prefetch={false} href={item.kind === "clip" ? `/clips/${encodeURIComponent(item.slug ?? "")}` : `/videos/${item.id}`}>
    <MediaTile title={item.title} imageUrl={item.thumbnail} titleLines={2} priority={eager} badge={formatTime(item.duration)} meta={<>
      {scope.kind === "game" ? <span>{item.owner}</span> : date && <time dateTime={item.createdAt}>{date}</time>}
      <span className="twitch-resource-number">{formatCount(item.views)} views</span>
    </>} />
  </Link>;
}

function Empty({ scope, view }: { scope: CatalogScope; view: CatalogView }) {
  if (view.media === "clip") return view.period === "ALL_TIME"
    ? <ResourceNotice title="No clips">{scope.kind === "game" ? "Nothing has been clipped in this category yet." : "Nobody has clipped this channel yet."}</ResourceNotice>
    : <ResourceNotice title={`No clips from the ${PERIOD_LABELS[view.period].toLowerCase()}`}>A longer period may have some.</ResourceNotice>;
  if (scope.kind === "game") return <ResourceNotice title="No videos">{view.language ? "Other languages may have some." : "Check the category name, or try another one."}</ResourceNotice>;
  return view.type
    ? <ResourceNotice title={`No ${TYPE_LABELS[view.type].toLowerCase()}`}>Other video types may have some.</ResourceNotice>
    : <ResourceNotice title="No videos">This channel has no videos on Twitch right now.</ResourceNotice>;
}

/** Built from the tile's own boxes, so it takes exactly the room the loaded tiles will. */
function CatalogSkeleton() {
  return <div className="twitch-broadcast-grid" role="status" aria-label="Loading">
    {Array.from({ length: 12 }, (_, index) => <div className="twitch-catalog-ghost" key={index} aria-hidden="true">
      <span className="media-tile-art aspect-video"><Skeleton height="100%" borderRadius={0} /></span>
      <span className="media-tile-caption">
        <span className="media-tile-title"><Skeleton width="82%" /></span>
        <span className="media-tile-meta"><Skeleton width={120} /></span>
      </span>
    </div>)}
  </div>;
}
