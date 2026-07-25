"use client";

import { useMemo } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { StyledSelect } from "@phantom/ui";
import type { EpisodeSummary, SeasonSummary } from "@/lib/types";

interface EpisodePickerProps {
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  season: number;
  episode: number;
  onChange: (season: number, episode: number) => void;
  /** Undefined at either end of the run. */
  onPrevious?: () => void;
  onNext?: () => void;
}

/**
 * The listing arrives with the page, so there is no loading state here and no
 * second round trip. When a series has no listing at all the numbers are typed
 * in instead, which still gets a stream.
 */
export function EpisodePicker({
  seasons,
  episodes,
  season,
  episode,
  onChange,
  onPrevious,
  onNext,
}: EpisodePickerProps) {
  const seasonEpisodes = useMemo(
    () => episodes.filter((item) => item.seasonNumber === season),
    [episodes, season]
  );

  if (seasons.length === 0) {
    return (
      <div className="flex items-end gap-3">
        <NumberField
          label="Season"
          value={season}
          min={0}
          onChange={(value) => onChange(value, 1)}
        />
        <NumberField
          label="Episode"
          value={episode}
          min={1}
          onChange={(value) => onChange(season, value)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3">
      <div className="w-[150px]">
        <StyledSelect
          label="Season"
          value={String(season)}
          onValueChange={(value) => onChange(Number(value), 1)}
          options={seasons.map((item) => ({
            value: String(item.seasonNumber),
            label: item.name,
            detail: `${item.episodeCount} episodes`,
          }))}
          compact
        />
      </div>
      <div className="w-[240px]">
        <StyledSelect
          label="Episode"
          value={String(episode)}
          onValueChange={(value) => onChange(season, Number(value))}
          options={seasonEpisodes.map((item) => ({
            value: String(item.episodeNumber),
            label: `${item.episodeNumber}. ${item.name}`,
            detail: item.airDate ?? undefined,
          }))}
          compact
        />
      </div>

      {/* Watching a series in order is the common case, and hunting for the
          next row in a select is the wrong amount of work for it. */}
      <div className="flex items-center gap-1.5">
        <StepButton label="Previous episode" onClick={onPrevious}>
          <IconChevronLeft size={17} stroke={2.4} />
        </StepButton>
        <StepButton label="Next episode" onClick={onNext}>
          <IconChevronRight size={17} stroke={2.4} />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className="soft-input flex h-11 w-10 items-center justify-center rounded-xl text-text-secondary transition-colors hover:border-text/30 hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
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
        value={value}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || min))
        }
        className="soft-input h-11 w-[110px] rounded-xl px-3 text-[13px] font-bold outline-none transition-colors focus-visible:border-text/30"
      />
    </label>
  );
}
