"use client";

import Image from "next/image";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import type { EpisodeSummary, SeasonSummary } from "@/lib/types";

interface EpisodeBrowserProps {
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  season: number;
  episode: number;
  onSeasonChange: (season: number) => void;
  onSelect: (episode: EpisodeSummary) => void;
}

/**
 * The full run, on the page. The same list is available inside the player for
 * when you are already watching; this is the one for deciding what to watch,
 * so it gets the room to show stills and synopses.
 */
export function EpisodeBrowser({
  seasons,
  episodes,
  season,
  episode,
  onSeasonChange,
  onSelect,
}: EpisodeBrowserProps) {
  const seasonEpisodes = episodes.filter((item) => item.seasonNumber === season);
  const current = seasons.find((item) => item.seasonNumber === season);

  // Some series carry no listing at all. Typing the numbers still reaches an
  // episode, and is better than a page with no way to leave the pilot.
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
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-text">
          Episodes
          {current && (
            <span className="ml-2 font-mono text-[11px] font-bold text-text-tertiary">
              {current.episodeCount}
            </span>
          )}
        </h2>

        <div className="flex flex-wrap gap-1.5">
          {seasons.map((item) => (
            <button
              key={item.seasonNumber}
              type="button"
              onClick={() => onSeasonChange(item.seasonNumber)}
              aria-current={item.seasonNumber === season}
              className={`h-9 rounded-full px-3.5 text-[12px] font-bold transition-colors ${
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
          return (
            <li key={`${item.seasonNumber}-${item.episodeNumber}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-current={playing}
                className="group flex w-full items-start gap-4 border-b border-border/60 py-3.5 text-left transition-colors hover:bg-surface/50"
              >
                <span className="w-6 shrink-0 pt-1 text-right font-mono text-[12px] text-text-tertiary">
                  {item.episodeNumber}
                </span>

                <span className="relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-xl bg-surface sm:w-[168px]">
                  {item.stillUrl && (
                    <Image
                      src={item.stillUrl}
                      alt=""
                      fill
                      sizes="168px"
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  )}
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
                      <span className="font-mono text-[10px] text-text-tertiary">
                        {item.airDate}
                      </span>
                    )}
                  </span>
                  {item.overview && (
                    <span className="mt-1.5 line-clamp-2 block max-w-2xl text-[12px] leading-5 text-text-secondary">
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
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase text-text-tertiary">
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
