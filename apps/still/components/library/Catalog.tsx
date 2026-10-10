"use client";

import Link from "next/link";
import { Suspense, use, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button, MediaTile, StyledSelect } from "@phantom/ui";
import type { BroadcastType, CatalogItem, CatalogScope, CatalogView, ClipPeriod, LiveOrder, SliceReceipt } from "@/lib/catalog/contracts";
import { CLIP_LANGUAGES, DEFAULT_LIVE_VIEW, DEFAULT_VIEW, VIDEO_LANGUAGES, VIEW_SIZE, sliceKey, viewSlice } from "@/lib/catalog/slices";
import { liveChannel } from "@/lib/categories";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { HomeTileSkeleton, RecommendedTile } from "../discovery/HomeMediaTile";
import { ResourceNotice } from "../resources/ResourcePage";
import { useCatalog } from "./use-catalog";

export interface CatalogPanel { id: string; label: string; content: ReactNode }

const TYPE_LABELS: Record<BroadcastType, string> = { ARCHIVE: "Past broadcasts", HIGHLIGHT: "Highlights", UPLOAD: "Uploads", PAST_PREMIERE: "Past premieres" };
const TYPE_OPTIONS = [{ value: "", label: "All videos" }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))];
const SORT_OPTIONS = [{ value: "TIME", label: "Recent" }, { value: "VIEWS", label: "Popular" }];
const PERIOD_LABELS: Record<ClipPeriod, string> = { LAST_DAY: "Past day", LAST_WEEK: "Past week", LAST_MONTH: "Past month", ALL_TIME: "All time" };
const PERIOD_OPTIONS = Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }));
const ORDER_OPTIONS: { value: LiveOrder; label: string }[] = [{ value: "VIEWER_COUNT", label: "Most watched" }, { value: "VIEWER_COUNT_ASC", label: "Least watched" }, { value: "RECENT", label: "Just started" }];
const LIVE_END: Record<LiveOrder, string> = { VIEWER_COUNT: "The most watched", VIEWER_COUNT_ASC: "The least watched", RECENT: "The latest" };
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
type Media = CatalogView["media"];
const isMedia = (tab: string): tab is Media => tab === "live" || tab === "vod" || tab === "clip";
const languagesFor = (media: Media): readonly string[] => media === "clip" ? CLIP_LANGUAGES : VIDEO_LANGUAGES;
/** Rows are revealed from what is already loaded, so showing more never costs a request. */
const STEP = 24;
/** How long the old contents take to fade out before they are replaced. Matches `.still-catalog-swap[data-leaving]`. */
const LEAVE_MS = 100;
type Shown = { view: CatalogView; panel?: string };

/**
 * Keeps the page as long as what is on screen when shorter contents replace longer ones, so the tabs stay where they
 * were pressed instead of the page jumping to its new end. Only the room down to the bottom of the window is held,
 * and scrolling back up gives it away again, so no empty stretch is left to scroll into.
 */
function holdHeight(element: HTMLElement | null, swapping: boolean) {
  if (!element) return;
  const held = parseFloat(element.style.minHeight) || 0;
  if (!swapping && !held) return;
  const box = element.getBoundingClientRect();
  // What follows the catalog on the page still has to fit under it. A page that is not scrolled cannot jump.
  const after = document.documentElement.scrollHeight - window.scrollY - box.bottom;
  const room = window.scrollY > 0 ? Math.ceil(window.innerHeight - box.top - after) : 0;
  const height = swapping ? room : Math.min(held, room);
  element.style.minHeight = height > 0 ? `${height}px` : "";
}

/**
 * Videos and clips for a channel or a category, plus any extra panels the page adds as tabs.
 * A category leads with who is live in it.
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
  const [shown, setShown] = useState<Shown>({ view: scope.kind === "game" ? DEFAULT_LIVE_VIEW : DEFAULT_VIEW });
  // The bar answers a tab or filter at once. The contents below fade out first, then change (see `.still-catalog-swap`).
  const [next, setNext] = useState<Shown>();
  useEffect(() => {
    if (!next) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => { holdHeight(body.current, true); setShown(next); setNext(undefined); }, reduced ? 0 : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [next]);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const release = () => holdHeight(body.current, false);
    window.addEventListener("scroll", release, { passive: true });
    return () => window.removeEventListener("scroll", release);
  }, []);
  const { view, panel } = next ?? shown;
  const active = panel ?? view.media;
  const tabs = [...(scope.kind === "game" ? [{ id: "live", label: "Live" }] : []), { id: "vod", label: "Videos" }, { id: "clip", label: "Clips" }, ...panels];

  const setView = (view: CatalogView) => setNext({ view });
  const open = (tab: string) => {
    if (tab === active) return;
    if (!isMedia(tab)) return setNext({ view, panel: tab });
    // A language Twitch has no clips axis for would be a request that cannot succeed.
    setView(tab === view.media ? view : { ...view, media: tab, language: view.language && languagesFor(tab).includes(view.language) ? view.language : undefined });
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

  return <section className="still-catalog" ref={root}>
    <div className="still-catalog-bar">
      <div className="still-catalog-tabs" role="tablist" aria-label="Sections" onKeyDown={step}>
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-selected={active === tab.id}
          aria-controls={`${id}-${isMedia(tab.id) ? "results" : tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => open(tab.id)}>{tab.label}</button>)}
      </div>
      {!panel && <div className="still-catalog-controls">
        {scope.kind === "channel" && view.media === "vod" && <StyledSelect variant="quiet" label="Video type" value={view.type ?? ""} options={TYPE_OPTIONS}
          onValueChange={value => setView({ ...view, type: (value || undefined) as BroadcastType | undefined })} />}
        {scope.kind === "game" && <StyledSelect variant="quiet" label="Language" value={view.language ?? ""}
          options={[{ value: "", label: "All languages" }, ...languagesFor(view.media).map(value => ({ value, label: languageNames.of(value) ?? value }))]}
          onValueChange={value => setView({ ...view, language: value || undefined })} />}
        {view.media === "live"
          ? <StyledSelect variant="quiet" label="Sort" value={view.order} options={ORDER_OPTIONS} onValueChange={value => setView({ ...view, order: value as LiveOrder })} />
          : view.media === "vod"
          ? <StyledSelect variant="quiet" label="Sort" value={view.sort} options={SORT_OPTIONS} onValueChange={value => setView({ ...view, sort: value as CatalogView["sort"] })} />
          : <StyledSelect variant="quiet" label="Period" value={view.period} options={PERIOD_OPTIONS} onValueChange={value => setView({ ...view, period: value as ClipPeriod })} />}
      </div>}
    </div>
    <div className="still-catalog-swap" ref={body} data-leaving={next ? "" : undefined}>
      <div className="still-catalog-panel" role="tabpanel" id={`${id}-results`} aria-labelledby={`${id}-tab-${shown.view.media}`} hidden={Boolean(shown.panel)}>
        <Suspense fallback={<CatalogSkeleton live={shown.view.media === "live"} />}>
          <CatalogResults scope={scope} view={shown.view} ahead={view} initial={initial} enabled={near} onOpen={open} />
        </Suspense>
      </div>
      {panels.map(extra => <div key={extra.id} className="still-catalog-panel" role="tabpanel" id={`${id}-${extra.id}`} aria-labelledby={`${id}-tab-${extra.id}`} hidden={shown.panel !== extra.id}>{extra.content}</div>)}
    </div>
  </section>;
}

function CatalogResults({ scope, view, ahead, initial, enabled, onOpen }: { scope: CatalogScope; view: CatalogView; ahead: CatalogView; initial?: Promise<SliceReceipt | null>; enabled: boolean; onOpen: (tab: Media) => void }) {
  const seed = initial ? use(initial) : null;
  const slice = viewSlice(scope, view);
  const key = sliceKey(slice);
  const { receipt, error, retry } = useCatalog(slice, seed, enabled, viewSlice(scope, ahead));
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  // The view whose skeleton is up, so that its answer fades in rather than replacing the skeleton at a stroke.
  const [awaited, setAwaited] = useState<string>();
  const pending = !receipt && !error;
  if (pending ? awaited !== key : awaited && awaited !== key) setAwaited(pending ? key : undefined);

  if (error) return <div className="still-catalog-notice"><ResourceNotice title="This didn’t load" error>{error}</ResourceNotice><Button variant="ghost" onClick={retry}>Try again</Button></div>;
  if (!receipt) return <CatalogSkeleton live={view.media === "live"} />;
  if (!receipt.items.length) return <div className="still-catalog-notice">
    <Empty scope={scope} view={view} />
    {/* A channel that keeps no videos is often still clipped, so the empty tab points somewhere. */}
    {scope.kind === "channel" && view.media === "vod" && !view.type && <Button variant="ghost" onClick={() => onOpen("clip")}>See clips</Button>}
    {/* A quiet category still has what was streamed in it before. */}
    {view.media === "live" && !view.language && <Button variant="ghost" onClick={() => onOpen("vod")}>See videos</Button>}
  </div>;

  const count = revealed[key] ?? STEP;
  const hidden = receipt.items.length - count;
  const total = receipt.totalCount;
  return <>
    <div className="still-broadcast-grid" data-arrived={awaited === key ? "" : undefined}>
      {receipt.items.slice(0, count).map((item, index) => <CatalogTile key={`${item.kind}:${item.id}`} item={item} scope={scope} eager={index < 4} />)}
    </div>
    {hidden > 0
      ? <div className="still-catalog-end"><Button variant="ghost" onClick={() => setRevealed({ ...revealed, [key]: count + STEP })}>Show more</Button></div>
      // Twitch pages no further than this. Say so, and say how to reach the rest.
      : view.media === "live"
        ? receipt.items.length >= VIEW_SIZE && <p className="still-catalog-end">{LIVE_END[view.order]} {receipt.items.length} streams. Change the sort{view.language ? "" : " or pick a language"} to find others.</p>
      : total !== undefined && receipt.items.length >= VIEW_SIZE && total > receipt.items.length
        ? <p className="still-catalog-end">{view.sort === "TIME" ? "The latest" : "The most viewed"} {receipt.items.length} of {total.toLocaleString("en")} videos. {view.sort === "TIME" ? "Sort by Popular" : "Sort by Recent"} or pick a type to find others.</p>
        : null}
  </>;
}

function CatalogTile({ item, scope, eager }: { item: CatalogItem; scope: CatalogScope; eager: boolean }) {
  // A stream looks here as it does on the home page.
  if (item.kind === "live") return <RecommendedTile channel={liveChannel(item)} />;
  const date = formatDate(item.createdAt);
  return <Link className="media-tile-hit" prefetch={false} href={item.kind === "clip" ? `/clips/${encodeURIComponent(item.slug ?? "")}` : `/videos/${item.id}`}>
    <MediaTile title={item.title} imageUrl={item.thumbnail} titleLines={2} priority={eager} badge={formatTime(item.duration)} meta={<>
      {scope.kind === "game" ? <span>{item.owner}</span> : date && <time dateTime={item.createdAt}>{date}</time>}
      <span className="still-resource-number">{formatCount(item.views)} views</span>
    </>} />
  </Link>;
}

function Empty({ scope, view }: { scope: CatalogScope; view: CatalogView }) {
  if (view.media === "live") return view.language
    ? <ResourceNotice title={`Nobody is live in ${languageNames.of(view.language) ?? "this language"}`}>Other languages may have someone.</ResourceNotice>
    : <ResourceNotice title="Nobody is live">Nobody is streaming this category right now.</ResourceNotice>;
  if (view.media === "clip") return view.period === "ALL_TIME"
    ? <ResourceNotice title="No clips">{scope.kind === "game" ? "Nothing has been clipped in this category yet." : "Nobody has clipped this channel yet."}</ResourceNotice>
    : <ResourceNotice title={`No clips from the ${PERIOD_LABELS[view.period].toLowerCase()}`}>A longer period may have some.</ResourceNotice>;
  if (scope.kind === "game") return <ResourceNotice title="No videos">{view.language ? "Other languages may have some." : "Check the category name, or try another one."}</ResourceNotice>;
  return view.type
    ? <ResourceNotice title={`No ${TYPE_LABELS[view.type].toLowerCase()}`}>Other video types may have some.</ResourceNotice>
    : <ResourceNotice title="No videos">This channel has no videos on Twitch right now.</ResourceNotice>;
}

/** Built from the tile's own boxes, so it takes exactly the room the loaded tiles will. */
function CatalogSkeleton({ live = false }: { live?: boolean }) {
  if (live) return <div className="still-broadcast-grid" role="status" aria-label="Loading">
    {Array.from({ length: 12 }, (_, index) => <HomeTileSkeleton key={index} />)}
  </div>;
  return <div className="still-broadcast-grid" role="status" aria-label="Loading">
    {Array.from({ length: 12 }, (_, index) => <div className="still-catalog-ghost" key={index} aria-hidden="true">
      <span className="media-tile-art aspect-video"><Skeleton height="100%" borderRadius={0} /></span>
      <span className="media-tile-caption">
        <span className="media-tile-title"><Skeleton width="82%" /></span>
        <span className="media-tile-meta"><Skeleton width={120} /></span>
      </span>
    </div>)}
  </div>;
}
