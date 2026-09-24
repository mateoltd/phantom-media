"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Play } from "@phosphor-icons/react/ssr";
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
  const seasonEpisodes = episodes.filter(
    (item) => item.seasonNumber === season,
  );
  const current = seasons.find((item) => item.seasonNumber === season);

  const storedProgress = useSyncExternalStore(
    subscribeProgress,
    readProgressRaw,
    noProgressOnServer,
  );
  const progress = useMemo(
    () => parseProgress(storedProgress),
    [storedProgress],
  );

  if (seasons.length === 0) {
    return (
      <section className="mt-12 pt-6">
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
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
              {item.seasonNumber === 0
                ? "Specials"
                : `Season ${item.seasonNumber}`}
            </button>
          ))}
        </div>
      </div>

      <ul key={season} className="episode-grid motion-list">
        {seasonEpisodes.map((item) => {
          const playing = item.episodeNumber === episode;
          const point =
            progress[progressKey(media, item.seasonNumber, item.episodeNumber)];
          const watched = watchedPercent(point);
          return (
            <li key={`${item.seasonNumber}-${item.episodeNumber}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-current={playing}
                className="episode-card group"
              >
                <span className="episode-card-art">
                  <Artwork
                    src={item.stillUrl}
                    sizes="(min-width: 640px) 152px, 104px"
                  />
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                      playing
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center text-white">
                      <Play weight="fill" size={23} />
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

                <span className="episode-card-copy">
                  <span className="episode-card-title">
                    <span className="episode-card-number">
                      {item.episodeNumber}.
                    </span>
                    {item.name}
                  </span>
                  {item.airDate && (
                    <time className="episode-card-date" dateTime={item.airDate}>
                      {item.airDate}
                    </time>
                  )}
                  {item.overview && (
                    <span className="episode-card-overview">
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
      <span className="text-sm font-medium mb-2 block text-text-tertiary">
        {label}
      </span>
      <input
        type="number"
        min={min}
        key={value}
        defaultValue={value}
        onBlur={(event) =>
          onChange(Math.max(min, Number(event.target.value) || min))
        }
        className="soft-input h-11 w-[110px] rounded-xl px-3 text-[13px] font-bold outline-none transition-colors focus-visible:border-text/30"
      />
    </label>
  );
}
