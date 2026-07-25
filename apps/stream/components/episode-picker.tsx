"use client";

import { useEffect, useMemo, useState } from "react";
import { StyledSelect } from "@phantom/ui";
import type { EpisodeSummary, MediaResult, SeasonSummary } from "@/lib/types";

type EpisodePayload = {
  seasons?: SeasonSummary[];
  episodes?: EpisodeSummary[];
  error?: string;
};

interface EpisodePickerProps {
  media: MediaResult;
  season: number;
  episode: number;
  onChange: (season: number, episode: number) => void;
}

export function EpisodePicker({
  media,
  season,
  episode,
  onChange,
}: EpisodePickerProps) {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(media.mediaType === "tv");
  // No episode listing available, so the numbers are typed in directly.
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (media.mediaType !== "tv") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ tmdbId: String(media.id) });
    if (media.imdbId) params.set("imdbId", media.imdbId);

    fetch(`/api/tv/episodes?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as EpisodePayload;
        if (!response.ok) {
          throw new Error(payload.error ?? `Episode lookup failed`);
        }
        return payload;
      })
      .then((payload) => {
        const nextSeasons = payload.seasons ?? [];
        setSeasons(nextSeasons);
        setEpisodes(payload.episodes ?? []);
        setManual(nextSeasons.length === 0);
        setLoading(false);

        const first =
          nextSeasons.find((item) => item.seasonNumber > 0) ?? nextSeasons[0];
        if (first && !nextSeasons.some((item) => item.seasonNumber === season)) {
          onChange(first.seasonNumber, 1);
        }
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setManual(true);
        setLoading(false);
      });

    return () => controller.abort();
    // `season` is deliberately absent: this runs once per series, not per pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, media.imdbId, media.mediaType, onChange]);

  const seasonEpisodes = useMemo(
    () => episodes.filter((item) => item.seasonNumber === season),
    [episodes, season]
  );

  if (media.mediaType !== "tv") return null;

  if (loading) {
    return (
      <div className="flex h-11 items-center gap-2 font-mono text-[11px] text-text-tertiary">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-phantom" />
        Loading episodes
      </div>
    );
  }

  if (manual) {
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
      <div className="w-[230px]">
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
    </div>
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
