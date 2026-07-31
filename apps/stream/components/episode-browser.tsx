"use client";

import { useMemo, useSyncExternalStore } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import {
  parseProgress,
  progressKey,
  readProgressRaw,
  subscribeProgress,
  watchedPercent,
} from "@/lib/resume";
import type { EpisodeSummary, MediaResult, SeasonSummary } from "@/lib/types";

interface EpisodeBrowserProps {
  media: MediaResult;
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  season: number;
  episode: number;
  onSeasonChange: (season: number) => void;
  onSelect: (episode: EpisodeSummary) => void;
}

const noProgressOnServer = () => "";

export function EpisodeBrowser({
  media,
  seasons,
  episodes,
  season,
  episode,
  onSeasonChange,
  onSelect,
}: EpisodeBrowserProps) {
  const seasonEpisodes = episodes.filter((item) => item.seasonNumber === season);
  const current = seasons.find((item) => item.seasonNumber === season);

  const storedProgress = useSyncExternalStore(
    subscribeProgress,
    readProgressRaw,
    noProgressOnServer
  );
  const progress = useMemo(() => parseProgress(storedProgress), [storedProgress]);

  if (seasons.length === 0) {
    return (
      <section className="mt-12 border-t border-border pt-6">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-text">
          Episodes
        </h2>
        <p className="mt-2 max-w-md text-[12px] leading-5 text-text-secondary">
          No listing is published for this series, so the season and episode go
          in by hand.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <NumberField
            label="Season"
            value={season}
            min={0}
            onChange={(value) => onSeasonChange(value)}
          />
          <NumberField
            label="Episode"
            value={episode}
            min={1}
            onChange={(value) =>
              onSelect({
                seasonNumber: season,
                episodeNumber: value,
                name: `Episode ${value}`,
                overview: "",
                airDate: null,
                stillUrl: null,
              })
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 sm:mt-12">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-text">
          Episodes
          {current && (
            <span className="ml-2 text-[13px] font-semibold text-text-tertiary">
              {current.episodeCount}
            </span>
          )}
        </h2>

        <div className="season-rail w-full sm:w-auto sm:max-w-[70%]">
          {seasons.map((item) => (
            <button
              key={item.seasonNumber}
              type="button"
              onClick={() => onSeasonChange(item.seasonNumber)}
              aria-current={item.seasonNumber === season}
              className={`h-9 whitespace-nowrap rounded-full px-3.5 text-[12px] font-bold transition-colors ${
                item.seasonNumber === season
                  ? "bg-phantom text-white"
                  : "border border-border text-text-secondary hover:border-text/30 hover:text-text"
              }`}
            >
              {item.seasonNumber === 0 ? "Specials" : `Season ${item.seasonNumber}`}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-2">
        {seasonEpisodes.map((item) => {
          const playing = item.episodeNumber === episode;
          const point =
            progress[
              progressKey(media, item.seasonNumber, item.episodeNumber)
            ];
          const watched = watchedPercent(point);
          return (
            <li key={`${item.seasonNumber}-${item.episodeNumber}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-current={playing}
                className="group flex w-full items-start gap-3 border-b border-border/60 py-3.5 text-left transition-colors hover:bg-surface/50 sm:gap-4"
              >
                <span className="w-4 shrink-0 pt-1 text-right font-mono text-[12px] text-text-tertiary sm:w-6">
                  {item.episodeNumber}
                </span>

                <span className="relative aspect-video w-[104px] shrink-0 overflow-hidden rounded-xl bg-surface sm:w-[168px]">
                  <Artwork src={item.stillUrl} sizes="(min-width: 640px) 168px, 104px" />
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                      playing
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-phantom text-white">
                      <IconPlayerPlayFilled size={14} />
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

                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span
                      className={`text-[14px] font-extrabold ${
                        playing ? "text-phantom" : "text-text"
                      }`}
                    >
                      {item.name}
                    </span>
                    {item.airDate && (
                      <span className="text-[11px] text-text-tertiary">
                        {item.airDate}
                      </span>
                    )}
                  </span>
                  {item.overview && (
                    <span className="mt-1.5 line-clamp-2 max-w-2xl text-[12px] leading-5 text-text-secondary">
                      {item.overview}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="eyebrow mb-2 block text-text-tertiary">
        {label}
      </span>
      <input
        type="number"
        min={min}
        defaultValue={value}
        onBlur={(event) =>
          onChange(Math.max(min, Number(event.target.value) || min))
        }
        className="soft-input h-11 w-[110px] rounded-xl px-3 text-[13px] font-bold outline-none transition-colors focus-visible:border-text/30"
      />
    </label>
  );
}
