"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EpisodeBrowser } from "@/components/episode-browser";
import { SiteFooter } from "@/components/site-footer";
import {
  VideoStage,
  type StageMenuModel,
  type StageStatus,
} from "@/components/player/video-stage";
import { EpisodePanel } from "@/components/player/episode-panel";
import type { StageMenuOption } from "@/components/player/stage-menu";
import { useChapters } from "@/components/player/use-chapters";
import { useResumeTracking } from "@/components/player/use-resume-tracking";
import { asSettled } from "@/lib/concurrent";
import { formatTimecode, kindLabel } from "@/lib/media";
import {
  attachCandidate,
  probeCandidates,
  type PlayerController,
  type QualityLevel,
  type QualityState,
} from "@/lib/player";
import { progressKey, readResumePoint, resumableTime } from "@/lib/resume";
import type {
  EpisodeSummary,
  MediaResult,
  ResolverResponse,
  SeasonSummary,
  StreamCandidate,
  SubtitleTrack,
} from "@/lib/types";

const PROBE_TIMEOUT_MS = 1_800;
const STARTUP_TIMEOUT_MS = 6_000;
/** How many sources are asked at once. */
const SOURCE_CONCURRENCY = 3;
const MAX_ATTEMPTS_PER_SOURCE = 2;
const AUTO_QUALITY = "auto";

export interface SourceEntry {
  id: string;
  label: string;
}

interface ResolverFailure {
  error?: string;
  retryable?: boolean;
  retryAfterMs?: number | null;
  server?: string | null;
}

interface SourceOffer {
  source: string;
  label: string;
  ranked: StreamCandidate[];
  attempts: StreamCandidate[];
  subtitles: SubtitleTrack[];
}

/**
 * What is known about a source for the title on screen. Anything the router
 * has already found out gets said out loud: picking a source by hand only
 * helps if the roster shows which ones are worth picking.
 */
export type SourceHealth =
  | "checking"
  | "playing"
  | "ready"
  | "empty"
  | "unreachable"
  | "limited";

const HEALTH_LABEL: Record<SourceHealth, string> = {
  checking: "checking",
  playing: "playing",
  ready: "has streams",
  empty: "no streams",
  unreachable: "unreachable",
  limited: "rate limited",
};

/** Sources with nothing to offer go last on the next pass rather than away. */
const HEALTH_ORDER: Record<SourceHealth, number> = {
  playing: 0,
  ready: 1,
  checking: 3,
  limited: 4,
  empty: 5,
  unreachable: 6,
};

/** A source nobody has asked yet sits between the ones that answered and the
 *  ones still being asked: worth trying, but not ahead of a known good one. */
const UNTRIED_ORDER = 2;

class ResolverRequestError extends Error {
  status: number;
  retryable: boolean;
  retryAfterMs: number | null;
  server: string | null;

  constructor(status: number, payload: ResolverFailure) {
    super(payload.error || `The resolver returned HTTP ${status}`);
    this.name = "ResolverRequestError";
    this.status = status;
    this.retryable = Boolean(payload.retryable);
    this.retryAfterMs = payload.retryAfterMs ?? null;
    this.server = payload.server ?? null;
  }
}

function candidateLabel(candidate: StreamCandidate, index: number): string {
  if (candidate.resolution && candidate.resolution >= 144) {
    return `${candidate.resolution}p`;
  }
  if (candidate.type === "hls") {
    return index === 0 ? "Adaptive" : `Adaptive ${index + 1}`;
  }
  return candidate.format?.toUpperCase() || candidate.type.toUpperCase();
}

function captionLabel(track: SubtitleTrack, index: number): string {
  return (
    track.display ||
    track.label ||
    track.language ||
    track.lang ||
    `Track ${index + 1}`
  );
}

function captionUrl(track: SubtitleTrack): string | null {
  return track.url ?? track.file ?? null;
}

function firstSeason(seasons: readonly SeasonSummary[]): number {
  return (
    seasons.find((season) => season.seasonNumber > 0)?.seasonNumber ??
    seasons[0]?.seasonNumber ??
    1
  );
}

/** A manifest can report its duration a beat after it starts loading. */
function seekWhenReady(video: HTMLVideoElement, seconds: number): void {
  if (video.readyState >= 1) {
    video.currentTime = seconds;
    return;
  }
  video.addEventListener(
    "loadedmetadata",
    () => {
      video.currentTime = seconds;
    },
    { once: true }
  );
}

export default function WatchPageClient({
  media,
  seasons,
  episodes,
  sources,
}: {
  media: MediaResult;
  seasons: readonly SeasonSummary[];
  episodes: readonly EpisodeSummary[];
  sources: readonly SourceEntry[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const unsubscribeQualityRef = useRef<(() => void) | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const routeRef = useRef<(options?: { prefer?: string }) => void>(() => {});
  const autoRoutedRef = useRef("");

  const [season, setSeason] = useState(() => firstSeason(seasons));
  const [episode, setEpisode] = useState(1);
  const [status, setStatus] = useState<StageStatus>("idle");
  const [statusText, setStatusText] = useState("Nothing attached yet");
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [health, setHealth] = useState<Readonly<Record<string, SourceHealth>>>(
    {}
  );
  const [candidates, setCandidates] = useState<StreamCandidate[]>([]);
  const [activeCandidate, setActiveCandidate] = useState<StreamCandidate | null>(
    null
  );
  const [levels, setLevels] = useState<readonly QualityLevel[]>([]);
  const [quality, setQuality] = useState<QualityState>({
    selected: -1,
    effective: -1,
  });
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [episodesOpen, setEpisodesOpen] = useState(false);

  const playable = media.tmdbId !== null;
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  const canRoute = status !== "working" && retrySeconds === 0 && playable;
  const resumeKey = progressKey(media, season, episode);

  useResumeTracking(videoRef, status === "ready" ? resumeKey : null);

  const detachController = useCallback(() => {
    unsubscribeQualityRef.current?.();
    unsubscribeQualityRef.current = null;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    setLevels([]);
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = null;
    detachController();

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    setStatus("idle");
    setStatusText("Nothing attached yet");
    setActiveSource(null);
    // What each source had for the last episode says nothing about this one.
    setHealth({});
    setCandidates([]);
    setActiveCandidate(null);
    setSubtitles([]);
  }, [detachController]);

  const markHealth = useCallback((source: string, state: SourceHealth) => {
    setHealth((current) =>
      current[source] === state ? current : { ...current, [source]: state }
    );
  }, []);

  const adoptController = useCallback((controller: PlayerController) => {
    controllerRef.current = controller;
    setLevels(controller.levels);
    unsubscribeQualityRef.current = controller.subscribeQuality(setQuality);
  }, []);

  /**
   * Puts one stream on screen. Resuming happens here rather than on the far
   * side of `play()` so a source swap lands back where the viewer was.
   */
  const attach = useCallback(
    async (
      candidate: StreamCandidate,
      source: string,
      requestId: number,
      resumeFrom: number | null
    ) => {
      const video = videoRef.current;
      if (!video) throw new Error("The player is not mounted");

      setStatusText(`Connecting to ${candidate.serverLabel}`);
      detachController();

      const controller = await attachCandidate(video, candidate, {
        timeoutMs: STARTUP_TIMEOUT_MS,
        onFatal: () => {
          if (requestIdRef.current !== requestId) return;
          markHealth(source, "unreachable");
          setStatusText("That source stopped. Finding another");
          routeRef.current();
        },
      });

      if (requestIdRef.current !== requestId) {
        controller.destroy();
        throw new Error("superseded");
      }

      adoptController(controller);
      setActiveCandidate(candidate);
      setActiveSource(source);
      markHealth(source, "playing");
      setStatus("ready");

      if (resumeFrom !== null) {
        seekWhenReady(video, resumeFrom);
        setStatusText(
          `Playing from ${candidate.serverLabel} · resumed at ${formatTimecode(resumeFrom)}`
        );
      } else {
        setStatusText(`Playing from ${candidate.serverLabel}`);
      }

      try {
        await video.play();
      } catch {
        // Autoplay is commonly refused after an async source swap; the centre
        // control and the spacebar both still work.
      }
    },
    [adoptController, detachController, markHealth]
  );

  const route = useCallback(
    async (options: { prefer?: string } = {}) => {
      if (!videoRef.current || !playable) return;
      if (retryAt > Date.now()) return;

      const requestId = ++requestIdRef.current;
      fetchControllerRef.current?.abort();
      const fetchController = new AbortController();
      fetchControllerRef.current = fetchController;
      detachController();

      setStatus("working");
      setStatusText("Looking for a source");
      setCandidates([]);
      setActiveCandidate(null);
      setSubtitles([]);

      // Sources that came up empty go last rather than being dropped: they
      // recover, and removing them would shrink the roster over a sitting.
      const ranked = sources
        .map((source) => source.id)
        .sort(
          (left, right) =>
            (health[left] ? HEALTH_ORDER[health[left]] : UNTRIED_ORDER) -
            (health[right] ? HEALTH_ORDER[health[right]] : UNTRIED_ORDER)
        );
      const order = options.prefer
        ? [options.prefer, ...ranked.filter((id) => id !== options.prefer)]
        : ranked;

      const askSource = async (source: string): Promise<SourceOffer> => {
        const label =
          sources.find((entry) => entry.id === source)?.label ?? source;
        markHealth(source, "checking");
        const params = new URLSearchParams({
          type: media.mediaType,
          tmdbId: String(media.tmdbId),
          server: source,
          title: media.title,
          year: media.year.slice(0, 4),
        });
        if (media.imdbId) params.set("imdbId", media.imdbId);
        if (media.mediaType === "tv") {
          params.set("season", String(season));
          params.set("episode", String(episode));
        }

        const response = await fetch(`/api/sources/resolve?${params}`, {
          signal: fetchController.signal,
        });
        const payload = (await response.json()) as ResolverResponse &
          ResolverFailure;
        if (!response.ok) throw new ResolverRequestError(response.status, payload);
        if (!payload.candidates?.length) {
          markHealth(source, "empty");
          throw new Error(`${label} offered no streams`);
        }

        const probe = await probeCandidates(payload.candidates, {
          timeoutMs: PROBE_TIMEOUT_MS,
          signal: fetchController.signal,
        });
        // A manifest that answered is worth more than one that merely exists,
        // so verified candidates go first and unprobed ones only back them up.
        const attempts = (
          probe.verified.length > 0
            ? probe.verified
            : probe.ranked.filter((candidate) => candidate.type !== "hls")
        ).slice(0, MAX_ATTEMPTS_PER_SOURCE);
        if (attempts.length === 0) {
          markHealth(source, "empty");
          throw new Error(`${label} had nothing playable`);
        }

        markHealth(source, "ready");
        return {
          source,
          label,
          ranked: probe.ranked,
          attempts,
          subtitles: payload.subtitles ?? [],
        };
      };

      setStatusText(
        `Asking ${Math.min(SOURCE_CONCURRENCY, order.length)} sources at once`
      );

      const resumeFrom = resumableTime(readResumePoint(resumeKey));
      let cooldownHintMs = 0;
      let rateLimited: ResolverRequestError | null = null;

      for await (const settled of asSettled(order, SOURCE_CONCURRENCY, askSource)) {
        if (requestIdRef.current !== requestId) return;

        if (settled.error) {
          const error = settled.error;
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (error instanceof ResolverRequestError) {
            if (error.status === 429 || (!error.server && error.retryable)) {
              markHealth(settled.item, "limited");
              rateLimited = error;
              break;
            }
            if (error.retryable) {
              cooldownHintMs = Math.max(cooldownHintMs, error.retryAfterMs ?? 0);
            }
            markHealth(
              settled.item,
              error.status === 429 ? "limited" : "unreachable"
            );
          } else if (health[settled.item] === "checking") {
            // `askSource` names the ones it can explain; anything left over
            // never answered at all.
            markHealth(settled.item, "unreachable");
          }
          continue;
        }

        const offer = settled.value;
        if (!offer) continue;
        setCandidates(offer.ranked);
        setSubtitles(offer.subtitles);

        let attached = false;
        for (const candidate of offer.attempts) {
          try {
            await attach(candidate, offer.source, requestId, resumeFrom);
            attached = true;
            break;
          } catch (error) {
            if ((error as Error).message === "superseded") return;
          }
        }

        if (attached) {
          setRetryAt(0);
          // Nothing left to ask: the sources still in flight would only warm a
          // cache nobody is going to read.
          fetchController.abort();
          fetchControllerRef.current = null;
          return;
        }
        markHealth(offer.source, "unreachable");
      }

      if (requestIdRef.current !== requestId) return;

      const cooldownMs = rateLimited
        ? Math.max(rateLimited.retryAfterMs ?? 0, 30_000)
        : Math.min(30_000, Math.max(10_000, cooldownHintMs));
      setNow(Date.now());
      setRetryAt(Date.now() + cooldownMs);
      setStatus("error");
      setStatusText(
        rateLimited
          ? `Upstream is rate limiting. Retry in ${Math.ceil(cooldownMs / 1_000)}s`
          : `No source could play this. Retry in ${Math.ceil(cooldownMs / 1_000)}s`
      );
      setActiveSource(null);
      if (fetchControllerRef.current === fetchController) {
        fetchControllerRef.current = null;
      }
    },
    [
      attach,
      detachController,
      health,
      markHealth,
      episode,
      media,
      playable,
      resumeKey,
      retryAt,
      season,
      sources,
    ]
  );

  useEffect(() => {
    routeRef.current = (options) => void route(options);
  }, [route]);

  // Arriving on the page is the request to play; making that a second click
  // was the slowest part of getting to a picture.
  useEffect(() => {
    const key = `${media.id}:${season}:${episode}`;
    if (autoRoutedRef.current === key || !playable) return;
    autoRoutedRef.current = key;
    routeRef.current();
  }, [episode, media.id, playable, season]);

  useEffect(() => {
    if (retryAt <= 0) return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= retryAt) {
        window.clearInterval(timer);
        setRetryAt(0);
        setStatusText("Cooldown finished. Ready to try again");
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      fetchControllerRef.current?.abort();
      unsubscribeQualityRef.current?.();
      controllerRef.current?.destroy();
    },
    []
  );

  const changeEpisode = useCallback(
    (nextSeason: number, nextEpisode: number) => {
      reset();
      setSeason(nextSeason);
      setEpisode(nextEpisode);
    },
    [reset]
  );

  // The listing is already in running order, so "next" is simply the row after
  // this one — which is what makes a season boundary a non-event.
  const position = useMemo(
    () =>
      episodes.findIndex(
        (item) => item.seasonNumber === season && item.episodeNumber === episode
      ),
    [episode, episodes, season]
  );
  const currentEpisode = position >= 0 ? episodes[position] : undefined;
  const previousEpisode = position > 0 ? episodes[position - 1] : undefined;
  const nextEpisode = position >= 0 ? episodes[position + 1] : undefined;

  const goToEpisode = useCallback(
    (target?: EpisodeSummary) => {
      if (!target) return;
      setEpisodesOpen(false);
      changeEpisode(target.seasonNumber, target.episodeNumber);
    },
    [changeEpisode]
  );

  /**
   * Chapters belong to the stream, not to the title, so they are re-read every
   * time a different one is attached.
   */
  const chapters = useChapters(
    videoRef,
    status === "ready" ? (activeCandidate?.id ?? null) : null
  );

  const captionTracks = useMemo(
    () => subtitles.filter((track) => captionUrl(track)),
    [subtitles]
  );

  const captionLabels = useMemo(
    () => captionTracks.map(captionLabel),
    [captionTracks]
  );

  const changeQuality = useCallback(
    (value: string) => {
      const controller = controllerRef.current;
      if (value === AUTO_QUALITY) {
        controller?.setLevel(-1);
        return;
      }
      if (value.startsWith("level:")) {
        controller?.setLevel(Number(value.slice(6)));
        return;
      }

      const candidate = candidates.find((item) => item.id === value);
      if (!candidate || !activeSource) return;
      // A different stream of the same title should not restart it.
      const resumeFrom = videoRef.current?.currentTime ?? 0;
      const requestId = ++requestIdRef.current;
      attach(candidate, activeSource, requestId, resumeFrom || null).catch(
        (error: Error) => {
          if (error.message === "superseded") return;
          setStatus("error");
          setStatusText(error.message);
        }
      );
    },
    [activeSource, attach, candidates]
  );

  /**
   * Renditions inside one stream are the real quality choice. Switching whole
   * streams is the fallback for sources that only ever offer fixed files.
   */
  const qualityMenu = useMemo<StageMenuModel | undefined>(() => {
    if (levels.length > 1) {
      const effective = levels.find((level) => level.index === quality.effective);
      const options: StageMenuOption[] = [
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
      ];
      return {
        options,
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
  }, [activeCandidate, candidates, changeQuality, levels, quality]);

  const sourceMenu = useMemo<StageMenuModel>(
    () => ({
      options: sources.map((source) => {
        const state = health[source.id];
        return {
          value: source.id,
          label: source.label,
          detail: state ? HEALTH_LABEL[state] : undefined,
        };
      }),
      value: activeSource,
      onChange: (id) => routeRef.current({ prefer: id }),
    }),
    [activeSource, health, sources]
  );

  const requestLabel = !playable
    ? "This title has no playable identifier"
    : retrySeconds > 0
      ? `Cooling down · ${retrySeconds}s`
      : status === "error"
        ? "Try every source again"
        : "Find a source and play";

  const isSeries = media.mediaType === "tv";
  const hasListing = isSeries && episodes.length > 0;

  const stage = (
    <VideoStage
      videoRef={videoRef}
      title={media.title}
      poster={media.backdropUrl}
      status={status}
      statusText={statusText}
      onRequestPlayback={() => routeRef.current()}
      canRequestPlayback={canRoute}
      requestLabel={requestLabel}
      quality={qualityMenu}
      sources={sourceMenu}
      chapters={chapters}
      onNextEpisode={nextEpisode ? () => goToEpisode(nextEpisode) : undefined}
      onEnded={nextEpisode ? () => goToEpisode(nextEpisode) : undefined}
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
        nextEpisode && status === "ready"
          ? { episode: nextEpisode, onPlay: () => goToEpisode(nextEpisode) }
          : undefined
      }
      captions={captionLabels}
      tracks={captionTracks.map((track, index) => (
        <track
          key={captionUrl(track) ?? index}
          kind="subtitles"
          src={captionUrl(track) ?? undefined}
          label={captionLabel(track, index)}
          srcLang={track.lang ?? track.language ?? "und"}
        />
      ))}
    />
  );

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader />

      {/* The picture runs the width of the window. Everything that explains it
          sits underneath, and everything that changes what is playing is
          reachable from inside it. */}
      <div className="stage-frame">{stage}</div>

      <div className="app-shell flex-1 pb-16 pt-6" id="about">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 max-w-2xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-phantom">
              {kindLabel(media.mediaType)}
              {media.year ? ` · ${media.year}` : ""}
            </p>
            <h1 className="mt-1.5 text-[clamp(1.5rem,3vw,2.3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-text">
              {media.title}
            </h1>
            {currentEpisode && (
              <p className="mt-2 text-[13px] font-bold text-text-secondary">
                S{currentEpisode.seasonNumber}E{currentEpisode.episodeNumber} ·{" "}
                {currentEpisode.name}
              </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-tertiary">
              {media.rating > 0 && (
                <span className="rounded-md border border-border px-1.5 py-0.5 text-text">
                  {media.rating.toFixed(1)}
                </span>
              )}
              {media.runtime && <span>{media.runtime}</span>}
              {media.genres.length > 0 && (
                <span>{media.genres.slice(0, 3).join(" · ")}</span>
              )}
            </p>
            {(currentEpisode?.overview || media.overview) && (
              <p className="mt-4 text-[13px] leading-6 text-text-secondary">
                {currentEpisode?.overview || media.overview}
              </p>
            )}
          </div>

          <div className="w-full max-w-xs shrink-0 rounded-2xl border border-border bg-surface/60 p-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
              Playback
            </p>
            <p className="mt-2 text-[12px] font-bold leading-5 text-text">
              {statusText}
            </p>
            <p className="mt-3 font-mono text-[10px] leading-5 text-text-tertiary">
              Space plays · J and L jump ten seconds · E lists episodes · N is
              the next one · F is fullscreen
            </p>
          </div>
        </div>

        {isSeries && (
          <EpisodeBrowser
            seasons={seasons}
            episodes={episodes}
            season={season}
            episode={episode}
            onSelect={goToEpisode}
            onSeasonChange={(next) => changeEpisode(next, 1)}
          />
        )}
      </div>

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}
