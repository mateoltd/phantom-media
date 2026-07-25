"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BrowseRail } from "@/components/browse-rail";
import { EpisodeBrowser } from "@/components/episode-browser";
import { TitleLogo } from "@/components/title-logo";
import { TitleMeta } from "@/components/title-meta";
import { SiteFooter } from "@/components/site-footer";
import {
  VideoStage,
  type CaptionChoice,
  type StageMenuModel,
  type StageStatus,
  type StageToast,
} from "@/components/player/video-stage";
import { EpisodePanel } from "@/components/player/episode-panel";
import { useChapters } from "@/components/player/use-chapters";
import { useResumeTracking } from "@/components/player/use-resume-tracking";
import {
  useSourceRouter,
  type SourceEntry,
} from "@/components/player/use-source-router";
import { formatTimecode } from "@/lib/media";
import { readPrefs } from "@/lib/player-prefs";
import { progressKey } from "@/lib/resume";
import {
  captionDetail,
  captionLabel,
  captionLanguage,
  mergeTracks,
  proxiedCaptionUrl,
} from "@/lib/subtitles";
import type {
  EpisodeSummary,
  MediaResult,
  SeasonSummary,
  StreamCandidate,
  SubtitleTrack,
} from "@/lib/types";

export type { SourceEntry };

const AUTO_QUALITY = "auto";
const AUTO_SOURCE = "auto";

function candidateLabel(candidate: StreamCandidate, index: number): string {
  if (candidate.resolution && candidate.resolution >= 144) {
    return `${candidate.resolution}p`;
  }
  if (candidate.type === "hls") {
    return index === 0 ? "Adaptive" : `Adaptive ${index + 1}`;
  }
  return candidate.format?.toUpperCase() || candidate.type.toUpperCase();
}

function firstSeason(seasons: readonly SeasonSummary[]): number {
  return (
    seasons.find((season) => season.seasonNumber > 0)?.seasonNumber ??
    seasons[0]?.seasonNumber ??
    1
  );
}

/** The four phases the stage draws differently. */
const STAGE_STATUS: Record<string, StageStatus> = {
  idle: "idle",
  racing: "working",
  holding: "working",
  attaching: "working",
  playing: "ready",
  cooldown: "error",
  error: "error",
};

export default function WatchPageClient({
  media,
  seasons,
  episodes,
  related,
  relatedTitle,
  sources,
}: {
  media: MediaResult;
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  related: readonly MediaResult[];
  relatedTitle: string;
  sources: readonly SourceEntry[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [season, setSeason] = useState(() => firstSeason(seasons));
  const [episode, setEpisode] = useState(1);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [catalogTracks, setCatalogTracks] = useState<SubtitleTrack[]>([]);
  const [toastDismissed, setToastDismissed] = useState(false);

  const router = useSourceRouter({ videoRef, media, season, episode, sources });
  const { state } = router;
  const status = STAGE_STATUS[state.phase] ?? "idle";

  // Only while something is actually on screen: writing a resume point for a
  // stalled element would store a position nobody watched to.
  useResumeTracking(
    videoRef,
    state.phase === "playing" ? progressKey(media, season, episode) : null,
  );

  /* -------------------------------------------------------------- episodes */

  const position = useMemo(
    () =>
      episodes.findIndex(
        (item) => item.seasonNumber === season && item.episodeNumber === episode,
      ),
    [episode, episodes, season],
  );
  const currentEpisode = position >= 0 ? episodes[position] : undefined;
  const nextEpisode = position >= 0 ? episodes[position + 1] : undefined;

  const changeEpisode = useCallback(
    (nextSeason: number, next: number) => {
      router.cancel();
      setCatalogTracks([]);
      setToastDismissed(false);
      setSeason(nextSeason);
      setEpisode(next);
    },
    [router],
  );

  const goToEpisode = useCallback(
    (target?: EpisodeSummary) => {
      if (!target) return;
      setEpisodesOpen(false);
      changeEpisode(target.seasonNumber, target.episodeNumber);
    },
    [changeEpisode],
  );

  /* ------------------------------------------------------------- subtitles */

  // Asked for alongside the race rather than after it: subtitles are an
  // addition to a picture, never a reason to wait for one.
  useEffect(() => {
    if (!media.imdbId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      imdbId: media.imdbId,
      type: media.mediaType,
    });
    if (media.mediaType === "tv") {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }

    fetch(`/api/subtitles/search?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { tracks: [] }))
      .then((body: { tracks?: SubtitleTrack[] }) => {
        setCatalogTracks(body.tracks ?? []);
      })
      .catch(() => {
        // A catalogue that is down means no extra subtitles, not an error.
      });

    return () => controller.abort();
  }, [episode, media.imdbId, media.mediaType, season]);

  const captionTracks = useMemo(() => {
    const preferred = typeof window === "undefined" ? [] : preferredLanguages();
    return mergeTracks(state.subtitles, catalogTracks, preferred);
  }, [catalogTracks, state.subtitles]);

  const captionChoices = useMemo<CaptionChoice[]>(
    () =>
      captionTracks.map((track, index) => ({
        value: String(index),
        label: captionLabel(track),
        detail: captionDetail(track),
        language: captionLanguage(track),
      })),
    [captionTracks],
  );

  // Changes whenever the element's track list is replaced, which is what tells
  // the caption renderer to read it again.
  const trackKey = useMemo(
    () => `${state.activeCandidate?.id ?? "none"}:${captionTracks.length}`,
    [captionTracks.length, state.activeCandidate?.id],
  );

  /* --------------------------------------------------------------- chapters */

  const chapters = useChapters(
    videoRef,
    state.phase === "playing" ? (state.activeCandidate?.id ?? null) : null,
  );

  /* ----------------------------------------------------------------- menus */

  const changeQuality = useCallback(
    (value: string) => {
      if (value === AUTO_QUALITY) {
        router.setQualityLevel(-1);
        return;
      }
      if (value.startsWith("level:")) {
        router.setQualityLevel(Number(value.slice(6)));
        return;
      }
      router.selectCandidate(value);
    },
    [router],
  );

  /**
   * Renditions inside one stream are the real quality choice. Switching whole
   * streams is the fallback for sources that only ever offer fixed files.
   */
  const qualityMenu = useMemo<StageMenuModel | undefined>(() => {
    const { levels, quality, candidates, activeCandidate } = state;
    if (levels.length > 1) {
      const effective = levels.find((level) => level.index === quality.effective);
      return {
        options: [
          {
            value: AUTO_QUALITY,
            label: "Auto",
            detail: effective ? `now ${effective.label}` : undefined,
          },
          ...[...levels]
            .sort((left, right) => right.height - left.height)
            .map((level) => ({
              value: `level:${level.index}`,
              label: level.label,
              detail:
                level.bitrate > 0
                  ? `${Math.round(level.bitrate / 1_000)} kbps`
                  : undefined,
            })),
        ],
        value:
          quality.selected === -1 ? AUTO_QUALITY : `level:${quality.selected}`,
        onChange: changeQuality,
        summary:
          quality.selected === -1
            ? (effective?.label ?? "Auto")
            : (levels.find((level) => level.index === quality.selected)?.label ??
              "Auto"),
      };
    }

    if (candidates.length > 1) {
      return {
        options: candidates.map((candidate, index) => ({
          value: candidate.id,
          label: candidateLabel(candidate, index),
          detail: candidate.type.toUpperCase(),
        })),
        value: activeCandidate?.id ?? null,
        onChange: changeQuality,
      };
    }

    return undefined;
  }, [changeQuality, state]);

  /**
   * Automatic sits at the top because it is what most sittings want, and
   * because it is the way back out of a pinned source. Picking a named source
   * pins it: the router will not quietly play a different one, which is the
   * whole point of picking.
   */
  const sourceMenu = useMemo<StageMenuModel>(() => {
    const byId = new Map(state.progress.map((entry) => [entry.id, entry]));
    const playingLabel = state.activeSource
      ? (sources.find((entry) => entry.id === state.activeSource)?.label ?? null)
      : null;

    return {
      options: [
        {
          value: AUTO_SOURCE,
          label: "Automatic",
          detail: playingLabel ? `now ${playingLabel}` : "best available",
        },
        ...sources.map((source) => {
          const progress = byId.get(source.id);
          return {
            value: source.id,
            label: source.label,
            detail: liveDetail(progress?.status) ?? progress?.reputation,
          };
        }),
      ],
      value: state.pinned ?? AUTO_SOURCE,
      onChange: (value) =>
        value === AUTO_SOURCE ? router.unpin() : router.pin(value),
    };
  }, [router, sources, state.activeSource, state.pinned, state.progress]);

  /* ----------------------------------------------------------------- toast */

  const toast = useMemo<StageToast | null>(() => {
    if (toastDismissed || state.resumedFrom === null) return null;
    return {
      text: `Resumed from ${formatTimecode(state.resumedFrom)}`,
      action: {
        label: "Start over",
        onClick: () => {
          const video = videoRef.current;
          if (video) video.currentTime = 0;
          setToastDismissed(true);
        },
      },
    };
  }, [state.resumedFrom, toastDismissed]);

  // Said once. A card that stays up forever is a card nobody reads.
  useEffect(() => {
    if (state.resumedFrom === null || toastDismissed) return;
    const timer = window.setTimeout(() => setToastDismissed(true), 9_000);
    return () => window.clearTimeout(timer);
  }, [state.resumedFrom, toastDismissed]);

  /* ---------------------------------------------------------------- render */

  const requestLabel =
    media.tmdbId === null
      ? "This title has no playable identifier"
      : router.retrySeconds > 0
        ? `Cooling down, ${router.retrySeconds}s left`
        : state.phase === "error" || state.phase === "cooldown"
          ? "Try every source again"
          : "Find a source and play";

  const isSeries = media.mediaType === "tv";
  const hasListing = isSeries && episodes.length > 0;

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader />

      {/* The picture runs the width of the window. Everything that explains it
          sits underneath, and everything that changes what is playing is
          reachable from inside it. */}
      <div className="stage-frame">
        <VideoStage
          videoRef={videoRef}
          title={media.title}
          subtitle={
            currentEpisode
              ? `S${currentEpisode.seasonNumber} E${currentEpisode.episodeNumber} · ${currentEpisode.name}`
              : media.year
          }
          poster={media.backdropUrl}
          status={status}
          statusText={state.statusText}
          onRequestPlayback={router.start}
          canRequestPlayback={router.canStart}
          requestLabel={requestLabel}
          progress={{
            sources: state.progress,
            answered: state.answered,
            asking: state.asking,
            total: state.total,
            elapsedMs: state.raceElapsedMs,
          }}
          quality={qualityMenu}
          sources={sourceMenu}
          captions={captionChoices}
          trackKey={trackKey}
          toast={toast}
          onDismissToast={() => setToastDismissed(true)}
          chapters={chapters}
          onNextEpisode={nextEpisode ? () => goToEpisode(nextEpisode) : undefined}
          episodesOpen={episodesOpen}
          onEpisodesOpenChange={setEpisodesOpen}
          episodePanel={
            hasListing ? (
              <EpisodePanel
                seasons={seasons}
                episodes={episodes}
                season={season}
                episode={episode}
                onSeasonChange={(next) => changeEpisode(next, 1)}
                onSelect={goToEpisode}
                onClose={() => setEpisodesOpen(false)}
              />
            ) : undefined
          }
          upNext={
            nextEpisode && state.phase === "playing"
              ? { episode: nextEpisode, onPlay: () => goToEpisode(nextEpisode) }
              : undefined
          }
          tracks={captionTracks.map((track, index) => (
            <track
              key={`${trackKey}:${index}`}
              kind="subtitles"
              src={proxiedCaptionUrl(track) ?? undefined}
              label={captionLabel(track)}
              srcLang={captionLanguage(track)}
            />
          ))}
        />
      </div>

      <div className="app-shell flex-1 pb-16 pt-7" id="about">
        <div className="max-w-3xl">
          <TitleLogo
            media={media}
            maxHeight="6rem"
            maxWidth="20rem"
            headingClassName="text-[clamp(1.5rem,3vw,2.3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-text"
          />

          {currentEpisode && (
            <p className="mt-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="eyebrow text-phantom">
                S{currentEpisode.seasonNumber} E{currentEpisode.episodeNumber}
              </span>
              <span className="text-[15px] font-bold text-text">
                {currentEpisode.name}
              </span>
            </p>
          )}

          <div className="mt-4">
            <TitleMeta media={media} />
          </div>

          {(currentEpisode?.overview || media.overview) && (
            <p className="mt-5 text-[13.5px] leading-6 text-text-secondary">
              {currentEpisode?.overview || media.overview}
            </p>
          )}
        </div>

        {isSeries && (
          <EpisodeBrowser
            media={media}
            seasons={seasons}
            episodes={episodes}
            season={season}
            episode={episode}
            onSelect={goToEpisode}
            onSeasonChange={(next) => changeEpisode(next, 1)}
          />
        )}
      </div>

      {related.length > 0 && (
        <div className="pb-10">
          <BrowseRail
            row={{
              id: "related",
              title: relatedTitle,
              mediaType: media.mediaType,
              items: [...related],
            }}
          />
        </div>
      )}

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}

/** What the roster shows for a source that is doing something right now. */
function liveDetail(status?: string): string | undefined {
  switch (status) {
    case "asking":
      return "asking now";
    case "offered":
      return "has streams";
    case "holding":
      return "best so far";
    case "playing":
      return "playing";
    case "empty":
      return "nothing for this";
    case "unreachable":
      return "did not answer";
    case "limited":
      return "rate limited";
    default:
      return undefined;
  }
}

/** The saved subtitle language first, then whatever the browser asks for. */
function preferredLanguages(): string[] {
  const saved = readPrefs().captionLanguage;
  const fromBrowser = navigator.languages ?? [navigator.language];
  const languages = fromBrowser.map((tag) => tag.split("-")[0]!).filter(Boolean);
  return saved ? [saved, ...languages] : languages;
}
