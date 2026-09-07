"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  IconCheck,
  IconChevronDown,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import {
  parseProgress,
  progressKey,
  readProgressRaw,
  subscribeProgress,
  watchedPercent,
} from "@/lib/resume";
import type { EpisodeSummary, MediaResult, SeasonSummary } from "@/lib/types";

interface EpisodePanelProps {
  media: MediaResult;
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  season: number;
  episode: number;
  onSelect: (episode: EpisodeSummary) => void;
  onClose: () => void;
}

const noProgressOnServer = () => "";

function seasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

export function EpisodePanel({
  media,
  seasons,
  episodes,
  season,
  episode,
  onSelect,
  onClose,
}: EpisodePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState(season);
  const [pickingSeason, setPickingSeason] = useState(false);

  const storedProgress = useSyncExternalStore(
    subscribeProgress,
    readProgressRaw,
    noProgressOnServer,
  );
  const progress = useMemo(
    () => parseProgress(storedProgress),
    [storedProgress],
  );

  const seasonEpisodes = useMemo(
    () => episodes.filter((item) => item.seasonNumber === view),
    [episodes, view],
  );

  useEffect(() => {
    const restore = document.activeElement;
    listRef.current?.focus({ preventScroll: true });
    return () => {
      if (restore instanceof HTMLElement)
        restore.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-episode="${episode}"]`);
    // scrollIntoView would also move the page on mobile.
    list.scrollTop = row
      ? Math.max(0, row.offsetTop - (list.clientHeight - row.clientHeight) / 2)
      : 0;
  }, [episode, pickingSeason, view]);

  return (
    <>
      <button
        type="button"
        className="stage-sheet-backdrop"
        aria-label="Dismiss episodes"
        onClick={onClose}
      />
      <aside
        className="stage-panel"
        aria-label="Episodes"
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "e") return;
          event.stopPropagation();
          if (event.key === "Escape" && pickingSeason) {
            setPickingSeason(false);
            return;
          }
          onClose();
        }}
      >
        <header className="stage-panel-head">
          {seasons.length > 1 ? (
            <button
              type="button"
              onClick={() => setPickingSeason((open) => !open)}
              aria-expanded={pickingSeason}
              className="stage-panel-season"
            >
              <span className="truncate">{seasonLabel(view)}</span>
              <IconChevronDown
                size={14}
                stroke={2.6}
                className={`shrink-0 text-stage-muted transition-transform ${
                  pickingSeason ? "rotate-180" : ""
                }`}
              />
            </button>
          ) : (
            <h2 className="px-1 text-[12.5px] font-extrabold text-stage-text">
              Episodes
            </h2>
          )}

          <span className="font-mono text-[10.5px] text-stage-muted">
            {seasonEpisodes.length}
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close episodes"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stage-muted transition-colors hover:bg-white/10 hover:text-stage-text"
          >
            <IconX size={15} stroke={2.2} />
          </button>
        </header>

        <div
          ref={listRef}
          className="inset-scroll stage-panel-list"
          tabIndex={-1}
        >
          {pickingSeason ? (
            <div className="p-1.5">
              {seasons.map((item) => {
                const showing = item.seasonNumber === view;
                const count =
                  item.episodeCount ||
                  episodes.filter(
                    (entry) => entry.seasonNumber === item.seasonNumber,
                  ).length;
                return (
                  <button
                    key={item.seasonNumber}
                    type="button"
                    aria-current={showing}
                    onClick={() => {
                      setView(item.seasonNumber);
                      setPickingSeason(false);
                    }}
                    className="stage-sheet-row"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {showing && (
                        <IconCheck
                          size={14}
                          stroke={2.6}
                          className="text-phantom"
                        />
                      )}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] ${
                        showing
                          ? "font-bold text-stage-text"
                          : "font-medium text-stage-text/85"
                      }`}
                    >
                      {seasonLabel(item.seasonNumber)}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-stage-muted">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {seasonEpisodes.map((item) => {
                const playing =
                  item.seasonNumber === season &&
                  item.episodeNumber === episode;
                const watched = watchedPercent(
                  progress[
                    progressKey(media, item.seasonNumber, item.episodeNumber)
                  ],
                );

                return (
                  <button
                    key={`${item.seasonNumber}-${item.episodeNumber}`}
                    type="button"
                    data-episode={playing ? item.episodeNumber : undefined}
                    onClick={() => onSelect(item)}
                    aria-current={playing}
                    className={`stage-ep group ${playing ? "stage-ep-current" : ""}`}
                  >
                    <span className="w-3.5 shrink-0 pt-0.5 text-right font-mono text-[10.5px] text-stage-muted">
                      {item.episodeNumber}
                    </span>

                    <span className="stage-ep-still">
                      <Artwork src={item.stillUrl} sizes="80px" />
                      <span
                        className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                          playing
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                        }`}
                      >
                        <span className="flex h-6 w-6 items-center justify-center text-white">
                          <IconPlayerPlay size={10} />
                        </span>
                      </span>
                      {watched > 0 && (
                        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                          <span
                            className="block h-full bg-phantom"
                            style={{ width: `${watched}%` }}
                          />
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`line-clamp-1 text-[12.5px] font-bold ${
                          playing ? "text-phantom-light" : "text-stage-text"
                        }`}
                      >
                        {item.name}
                      </span>
                      {item.overview && (
                        <span className="stage-ep-overview mt-0.5 line-clamp-2 text-[11px] leading-[1.4] text-stage-muted">
                          {item.overview}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}

              {seasonEpisodes.length === 0 && (
                <p className="px-3 py-8 text-center text-[12px] text-stage-muted">
                  No episodes listed for this season.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
