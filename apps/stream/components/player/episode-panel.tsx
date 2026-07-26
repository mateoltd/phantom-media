"use client";

import { useEffect, useRef } from "react";
import { IconPlayerPlayFilled, IconX } from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import type { EpisodeSummary, SeasonSummary } from "@/lib/types";

interface EpisodePanelProps {
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  season: number;
  episode: number;
  onSeasonChange: (season: number) => void;
  onSelect: (episode: EpisodeSummary) => void;
  onClose: () => void;
}

/**
 * The episode list, inside the picture.
 *
 * It has to live in the stage rather than under it: the stage is what goes
 * fullscreen, and reaching the next episode should never mean leaving what you
 * are watching to scroll a page.
 */
export function EpisodePanel({
  seasons,
  episodes,
  season,
  episode,
  onSeasonChange,
  onSelect,
  onClose,
}: EpisodePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const seasonEpisodes = episodes.filter((item) => item.seasonNumber === season);

  // Open on what is playing, not at the top of a twenty-row list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-episode="${season}-${episode}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [episode, season]);

  return (
    <aside className="stage-panel" aria-label="Episodes">
      <header className="flex items-center justify-between gap-3 border-b border-stage-line px-4 py-3">
        <h2 className="text-[13px] font-extrabold text-stage-text">Episodes</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close episodes"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-stage-muted transition-colors hover:bg-white/10 hover:text-stage-text"
        >
          <IconX size={16} stroke={2.2} />
        </button>
      </header>

      {seasons.length > 1 && (
        <div className="stage-panel-seasons">
          {seasons.map((item) => (
            <button
              key={item.seasonNumber}
              type="button"
              onClick={() => onSeasonChange(item.seasonNumber)}
              aria-current={item.seasonNumber === season}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                item.seasonNumber === season
                  ? "bg-phantom text-white"
                  : "bg-white/8 text-stage-muted hover:bg-white/14 hover:text-stage-text"
              }`}
            >
              {item.seasonNumber === 0 ? "Specials" : `S${item.seasonNumber}`}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className="inset-scroll min-h-0 flex-1 px-2 py-2">
        {seasonEpisodes.map((item) => {
          const playing =
            item.seasonNumber === season && item.episodeNumber === episode;
          return (
            <button
              key={`${item.seasonNumber}-${item.episodeNumber}`}
              type="button"
              data-episode={`${item.seasonNumber}-${item.episodeNumber}`}
              onClick={() => onSelect(item)}
              aria-current={playing}
              className={`flex w-full gap-3 rounded-xl p-2 text-left transition-colors ${
                playing ? "bg-white/12" : "hover:bg-white/8"
              }`}
            >
              <span className="relative aspect-video w-[104px] shrink-0 overflow-hidden rounded-lg bg-stage-raised">
                <Artwork
                  src={item.stillUrl}
                  sizes="104px"
                  fallback={
                    <span className="flex h-full w-full items-center justify-center font-mono text-[11px] text-stage-muted">
                      {item.episodeNumber}
                    </span>
                  }
                />
                {playing && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <IconPlayerPlayFilled size={14} className="text-phantom" />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1 py-0.5">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-stage-muted">
                    {item.episodeNumber}
                  </span>
                  <span
                    className={`line-clamp-1 text-[12px] font-bold ${
                      playing ? "text-phantom" : "text-stage-text"
                    }`}
                  >
                    {item.name}
                  </span>
                </span>
                {item.overview && (
                  <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-stage-muted">
                    {item.overview}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {seasonEpisodes.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-stage-muted">
            No episodes listed for this season.
          </p>
        )}
      </div>
    </aside>
  );
}
