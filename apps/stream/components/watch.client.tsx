"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconStarFilled } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { EpisodePicker } from "@/components/episode-picker";
import { SiteFooter } from "@/components/site-footer";
import { SourcePanel, type SourceEntry } from "@/components/source-panel";
import { VideoStage, type StageStatus } from "@/components/player/video-stage";
import type { StageMenuOption } from "@/components/player/stage-menu";
import { backdropUrl } from "@/lib/media-images";
import { kindLabel } from "@/lib/media";
import {
  attachCandidate,
  probeCandidates,
  type PlayerController,
} from "@/lib/player";
import type {
  MediaResult,
  ResolverResponse,
  StreamCandidate,
  SubtitleTrack,
} from "@/lib/types";

const PROBE_TIMEOUT_MS = 2_500;
const STARTUP_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS_PER_SOURCE = 2;

interface ResolverFailure {
  error?: string;
  retryable?: boolean;
  retryAfterMs?: number | null;
  server?: string | null;
}

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

function qualityLabel(candidate: StreamCandidate, index: number): string {
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

export default function WatchPageClient({
  media,
  sources,
}: {
  media: MediaResult;
  sources: readonly SourceEntry[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const routeRef = useRef<(source?: string) => void>(() => {});

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [status, setStatus] = useState<StageStatus>("idle");
  const [statusText, setStatusText] = useState("Nothing attached yet");
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [cooling, setCooling] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<StreamCandidate[]>([]);
  const [activeCandidate, setActiveCandidate] =
    useState<StreamCandidate | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const backdrop = backdropUrl(media);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  const busy = status === "working";
  const canRoute = !busy && retrySeconds === 0;

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = null;
    controllerRef.current?.destroy();
    controllerRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    setStatus("idle");
    setStatusText("Nothing attached yet");
    setActiveSource(null);
    setCandidates([]);
    setActiveCandidate(null);
    setSubtitles([]);
  }, []);

  const attach = useCallback(
    async (
      candidate: StreamCandidate,
      source: string,
      requestId: number,
      remainingSources: string[]
    ) => {
      const video = videoRef.current;
      if (!video) throw new Error("The player is not mounted");

      setStatus("working");
      setStatusText(`Connecting to ${candidate.serverLabel}`);
      controllerRef.current?.destroy();

      const controller = await attachCandidate(video, candidate, {
        timeoutMs: STARTUP_TIMEOUT_MS,
        onFatal: (error) => {
          if (requestIdRef.current !== requestId) return;
          const next = remainingSources[0];
          if (next) {
            setStatusText(`${error.message}. Moving to the next source`);
            routeRef.current(next);
          } else {
            setStatus("error");
            setStatusText("The attached source stopped responding");
            setActiveSource(null);
          }
        },
      });

      if (requestIdRef.current !== requestId) {
        controller.destroy();
        throw new Error("superseded");
      }

      controllerRef.current = controller;
      setActiveCandidate(candidate);
      setActiveSource(source);
      setStatus("ready");
      setStatusText(`Playing from ${candidate.serverLabel}`);
      try {
        await video.play();
      } catch {
        // Autoplay is commonly refused after an async source swap; the centre
        // control and the spacebar both still work.
      }
    },
    []
  );

  const route = useCallback(
    async (preferredSource?: string) => {
      if (!videoRef.current) return;
      if (retryAt > Date.now()) return;

      const requestId = ++requestIdRef.current;
      fetchControllerRef.current?.abort();
      const fetchController = new AbortController();
      fetchControllerRef.current = fetchController;
      controllerRef.current?.destroy();
      controllerRef.current = null;

      setStatus("working");
      setStatusText("Looking for a source");
      setCandidates([]);
      setActiveCandidate(null);
      setSubtitles([]);

      const ids = sources.map((source) => source.id);
      const order = preferredSource
        ? [preferredSource, ...ids.filter((id) => id !== preferredSource)]
        : ids;
      const failed = new Set<string>();
      let suggestedCooldownMs = 0;

      for (let index = 0; index < order.length; index += 1) {
        if (requestIdRef.current !== requestId) return;
        const source = order[index];
        if (!source) continue;
        const label =
          sources.find((entry) => entry.id === source)?.label ?? source;
        setActiveSource(source);
        setStatusText(`Asking ${label}`);

        try {
          const params = new URLSearchParams({
            type: media.mediaType,
            tmdbId: String(media.id),
            server: source,
            title: media.title,
            year: media.year,
            date: media.releaseDate,
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
          if (!payload.candidates?.length) throw new Error("no streams offered");

          setStatusText(
            `Checking ${payload.candidates.length} ${
              payload.candidates.length === 1 ? "stream" : "streams"
            } from ${label}`
          );
          const probe = await probeCandidates(payload.candidates, {
            timeoutMs: PROBE_TIMEOUT_MS,
            signal: fetchController.signal,
          });
          if (requestIdRef.current !== requestId) return;

          setRetryAt(0);
          setCandidates(probe.ranked);
          setSubtitles(payload.subtitles ?? []);

          // A manifest that answered is worth more than one that merely exists,
          // so verified candidates go first and unprobed ones only back them up.
          const attempts = (
            probe.verified.length > 0
              ? probe.verified
              : probe.ranked.filter((candidate) => candidate.type !== "hls")
          ).slice(0, MAX_ATTEMPTS_PER_SOURCE);

          if (attempts.length === 0) {
            failed.add(source);
            continue;
          }

          for (const candidate of attempts) {
            try {
              await attach(candidate, source, requestId, order.slice(index + 1));
              setCooling(new Set(failed));
              return;
            } catch (error) {
              if ((error as Error).message === "superseded") return;
              failed.add(source);
            }
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") return;

          if (
            error instanceof ResolverRequestError &&
            (error.status === 429 || (!error.server && error.retryable))
          ) {
            const cooldownMs = Math.max(error.retryAfterMs ?? 0, 30_000);
            setNow(Date.now());
            setRetryAt(Date.now() + cooldownMs);
            setStatus("error");
            setStatusText(
              `Upstream is rate limiting. Retry in ${Math.ceil(cooldownMs / 1_000)}s`
            );
            setActiveSource(null);
            setCooling(new Set(failed));
            fetchControllerRef.current = null;
            return;
          }

          if (error instanceof ResolverRequestError && error.retryable) {
            suggestedCooldownMs = Math.max(
              suggestedCooldownMs,
              error.retryAfterMs ?? 0
            );
          }
          failed.add(source);
        }
      }

      if (requestIdRef.current === requestId) {
        const cooldownMs = Math.min(30_000, Math.max(10_000, suggestedCooldownMs));
        setNow(Date.now());
        setRetryAt(Date.now() + cooldownMs);
        setStatus("error");
        setStatusText(
          `No source could play this. Retry in ${Math.ceil(cooldownMs / 1_000)}s`
        );
        setActiveSource(null);
        setCooling(new Set(failed));
      }
      if (fetchControllerRef.current === fetchController) {
        fetchControllerRef.current = null;
      }
    },
    [attach, episode, media, retryAt, season, sources]
  );

  useEffect(() => {
    routeRef.current = (source?: string) => void route(source);
  }, [route]);

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

  const qualities = useMemo<StageMenuOption[]>(
    () =>
      candidates.map((candidate, index) => ({
        value: candidate.id,
        label: qualityLabel(candidate, index),
        detail: candidate.serverLabel,
      })),
    [candidates]
  );

  const captionTracks = useMemo(
    () => subtitles.filter((track) => captionUrl(track)),
    [subtitles]
  );

  const captionLabels = useMemo(
    () => captionTracks.map(captionLabel),
    [captionTracks]
  );

  const changeQuality = (value: string) => {
    const candidate = candidates.find((item) => item.id === value);
    if (!candidate || !activeSource) return;
    const requestId = ++requestIdRef.current;
    attach(candidate, activeSource, requestId, []).catch((error: Error) => {
      if (error.message === "superseded") return;
      setStatus("error");
      setStatusText(error.message);
    });
  };

  const requestLabel =
    retrySeconds > 0
      ? `Cooling down · ${retrySeconds}s`
      : status === "error"
        ? "Try every source again"
        : "Find a source and play";

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader />

      <div className="app-shell flex-1 pb-14 pt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 pb-4 text-[12px] font-bold text-text-tertiary transition-colors hover:text-text"
        >
          <IconArrowLeft size={15} stroke={2.2} />
          Back to search
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-black/[0.07] pb-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase text-phantom">
              {kindLabel(media.mediaType)}
              {media.year ? ` · ${media.year}` : ""}
            </p>
            <h1 className="mt-1 text-[clamp(1.6rem,3.2vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-text">
              {media.title}
            </h1>
            {media.rating > 0 && (
              <p className="mt-2 flex items-center gap-1 font-mono text-[11px] text-text-secondary">
                <IconStarFilled size={11} className="text-phantom" />
                {media.rating.toFixed(1)}
              </p>
            )}
          </div>

          <EpisodePicker
            key={`${media.mediaType}-${media.id}`}
            media={media}
            season={season}
            episode={episode}
            onChange={changeEpisode}
          />
        </div>

        <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <VideoStage
              videoRef={videoRef}
              title={media.title}
              poster={backdrop}
              status={status}
              statusText={statusText}
              onRequestPlayback={() => void route()}
              canRequestPlayback={canRoute}
              requestLabel={requestLabel}
              qualities={qualities}
              activeQuality={activeCandidate?.id ?? null}
              onQualityChange={changeQuality}
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

            {media.overview && (
              <p className="mt-5 max-w-2xl text-[13px] leading-6 text-text-secondary">
                {media.overview}
              </p>
            )}

            <p className="mt-4 max-w-2xl font-mono text-[10px] leading-5 text-text-tertiary">
              Space plays · J and L jump ten seconds · arrows seek and set
              volume · M mutes · F is fullscreen
            </p>
          </div>

          <SourcePanel
            sources={sources}
            status={status === "working" ? "working" : status}
            statusText={
              retrySeconds > 0 ? `Cooling down · ${retrySeconds}s` : statusText
            }
            detail={
              activeCandidate
                ? `${activeCandidate.serverLabel} · ${activeCandidate.type.toUpperCase()}`
                : "No stream attached"
            }
            activeSource={status === "ready" ? activeSource : null}
            cooling={cooling}
            canRoute={canRoute}
            onAutoRoute={() => void route()}
            onPickSource={(id) => void route(id)}
          />
        </div>
      </div>

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}
