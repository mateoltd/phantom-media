"use client";

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import {
  IconBadgeCc,
  IconBroadcast,
  IconChevronRight,
  IconLayoutList,
  IconMaximize,
  IconMinimize,
  IconPictureInPicture,
  IconPlayerTrackNextFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRefresh,
  IconRewindBackward10,
  IconRewindForward10,
  IconSettings,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react";
import { formatTimecode } from "@/lib/media";
import type { EpisodeSummary } from "@/lib/types";
import { ScrubBar } from "./scrub-bar";
import { StageMenu, type StageMenuOption } from "./stage-menu";
import { UpNext } from "./up-next";
import type { Chapter } from "./use-chapters";
import { useVideoState, type TimeListener } from "./use-video-state";

export type StageStatus = "idle" | "working" | "ready" | "error";

export interface StageMenuModel {
  options: readonly StageMenuOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Printed beside the icon when there is room. */
  summary?: string;
}

interface VideoStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
  poster?: string | null;
  status: StageStatus;
  statusText: string;
  /** The big centre button: starts the search for a playable source. */
  onRequestPlayback: () => void;
  canRequestPlayback: boolean;
  requestLabel: string;
  quality?: StageMenuModel;
  /** The source roster, kept in here rather than beside the picture. */
  sources?: StageMenuModel;
  /**
   * Subtitle choices, in the same order as `tracks`. The stage owns which one
   * is showing because track modes live on the media element, not in React.
   */
  captions?: readonly string[];
  /** `<track>` elements, which have to be children of the media element. */
  tracks?: ReactNode;
  /** Set for a series that has somewhere to go after this episode. */
  onNextEpisode?: () => void;
  onEnded?: () => void;
  /** The episode list, rendered inside the stage so it survives fullscreen. */
  episodePanel?: ReactNode;
  episodesOpen?: boolean;
  onEpisodesOpenChange?: (open: boolean) => void;
  /** Whatever the stream declared. Empty for the many that declare nothing. */
  chapters?: readonly Chapter[];
  /** Offered over the credits. The stage owns the timing; the page owns the
   *  episode and what happens when it is taken. */
  upNext?: { episode: EpisodeSummary; onPlay: () => void };
  children?: ReactNode;
}

const CAPTIONS_OFF = "off";
const IDLE_DELAY_MS = 2600;

/**
 * Picture-in-picture support is a fact about the browser, and the server has
 * no browser. Reading it during render is what made the two trees disagree, so
 * it is read as an external value with an explicit server answer of "no".
 */
const NEVER_CHANGES = () => () => {};
const pipSupported = () => document.pictureInPictureEnabled;
const pipUnsupportedOnServer = () => false;

export function VideoStage({
  videoRef,
  title,
  poster,
  status,
  statusText,
  onRequestPlayback,
  canRequestPlayback,
  requestLabel,
  quality,
  sources,
  captions = [],
  tracks,
  onNextEpisode,
  onEnded,
  episodePanel,
  episodesOpen = false,
  onEpisodesOpenChange,
  chapters = [],
  upNext,
  children,
}: VideoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const heldAwakeRef = useRef(false);
  const [caption, setCaption] = useState(CAPTIONS_OFF);
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const [skippable, setSkippable] = useState<Chapter | null>(null);
  const canPictureInPicture = useSyncExternalStore(
    NEVER_CHANGES,
    pipSupported,
    pipUnsupportedOnServer
  );
  const {
    state,
    subscribeTime,
    togglePlay,
    seekBy,
    seekTo,
    setVolume,
    nudgeVolume,
    toggleMute,
    toggleFullscreen,
    togglePictureInPicture,
    showTextTrack,
  } = useVideoState(videoRef, containerRef);

  const showFlash = useCallback((text: string) => {
    setFlash({ id: Date.now(), text });
  }, []);

  // Hiding the chrome is a class on one element, so the pointer can move
  // across the picture without React hearing about it at all.
  const setIdle = useCallback((idle: boolean) => {
    containerRef.current?.classList.toggle("stage-idle", idle);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (!playingRef.current || heldAwakeRef.current) return;
    idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS);
  }, [setIdle]);

  const wake = useCallback(() => {
    setIdle(false);
    scheduleIdle();
  }, [scheduleIdle, setIdle]);

  // Playback starting is enough to begin the countdown; the pointer does not
  // have to move first. Pausing brings the chrome back and keeps it up.
  useEffect(() => {
    playingRef.current = state.playing;
    if (!state.playing) setIdle(false);
    scheduleIdle();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [scheduleIdle, setIdle, state.playing]);

  const holdAwake = useCallback(
    (held: boolean) => {
      heldAwakeRef.current = held;
      if (held) setIdle(false);
      scheduleIdle();
    },
    [scheduleIdle, setIdle]
  );

  // Entering and leaving a chapter happens a handful of times an episode, so
  // this one is allowed to be state — it has a label to render.
  useEffect(
    () =>
      // The subscription answers immediately, so an empty chapter list clears
      // the offer on the same tick it arrives.
      subscribeTime(({ currentTime }) => {
        const inside =
          chapters.find(
            (chapter) =>
              chapter.skippable &&
              currentTime >= chapter.start &&
              currentTime < chapter.end - 1
          ) ?? null;
        setSkippable((current) =>
          current?.start === inside?.start ? current : inside
        );
      }),
    [chapters, subscribeTime]
  );

  useEffect(() => {
    skipRef.current?.classList.toggle("stage-skip-visible", Boolean(skippable));
  }, [skippable]);

  const changeCaption = (value: string) => {
    setCaption(value);
    showTextTrack(value === CAPTIONS_OFF ? null : Number(value));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Let the browser own typing and tabbing.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.isContentEditable) return;

    const key = event.key;
    const handlers: Record<string, () => void> = {
      " ": () => {
        togglePlay();
        showFlash(state.playing ? "Paused" : "Playing");
      },
      k: () => {
        togglePlay();
        showFlash(state.playing ? "Paused" : "Playing");
      },
      ArrowLeft: () => {
        seekBy(-5);
        showFlash("−5s");
      },
      ArrowRight: () => {
        seekBy(5);
        showFlash("+5s");
      },
      j: () => {
        seekBy(-10);
        showFlash("−10s");
      },
      l: () => {
        seekBy(10);
        showFlash("+10s");
      },
      ArrowUp: () => {
        nudgeVolume(0.1);
        showFlash(`Volume ${Math.round(Math.min(1, state.volume + 0.1) * 100)}%`);
      },
      ArrowDown: () => {
        nudgeVolume(-0.1);
        showFlash(`Volume ${Math.round(Math.max(0, state.volume - 0.1) * 100)}%`);
      },
      m: () => {
        toggleMute();
        showFlash(state.muted ? "Sound on" : "Muted");
      },
      f: () => toggleFullscreen(),
      n: () => onNextEpisode?.(),
      e: () => onEpisodesOpenChange?.(!episodesOpen),
      Home: () => seekTo(0),
      End: () => seekTo(state.duration),
    };

    const handler =
      handlers[key] ??
      (/^[0-9]$/.test(key) && state.duration > 0
        ? () => {
            const ratio = Number(key) / 10;
            seekTo(state.duration * ratio);
            showFlash(`${Number(key) * 10}%`);
          }
        : undefined);

    if (!handler) return;
    event.preventDefault();
    wake();
    handler();
  };

  const showPoster = Boolean(poster) && status !== "ready";
  const VolumeIcon =
    state.muted || state.volume === 0
      ? IconVolumeOff
      : state.volume < 0.5
        ? IconVolume2
        : IconVolume;

  return (
    <div
      ref={containerRef}
      className="stage w-full overflow-hidden outline-none"
      tabIndex={0}
      role="region"
      aria-label={`${title} player`}
      onKeyDown={handleKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => playingRef.current && setIdle(true)}
    >
      {showPoster && poster && (
        <Image
          src={poster}
          alt=""
          fill
          sizes="(min-width: 1024px) 80vw, 100vw"
          unoptimized
          priority
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
      )}
      {status !== "ready" && (
        <div
          className="absolute inset-0 bg-gradient-to-t from-stage via-stage/45 to-stage/70"
          aria-hidden="true"
        />
      )}

      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        className="absolute inset-0"
        onClick={() => status === "ready" && togglePlay()}
        onDoubleClick={toggleFullscreen}
        onEnded={onEnded}
      >
        {tracks}
      </video>

      {children}

      {/* The centre affordance is whatever the stage needs next: start, retry,
          or nothing at all once a source is attached. */}
      {(status === "idle" || status === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <button
            type="button"
            disabled={!canRequestPlayback}
            onClick={onRequestPlayback}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-phantom text-white shadow-[0_10px_36px_rgba(0,0,0,0.45)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-stage-raised disabled:text-stage-muted"
          >
            {status === "error" ? (
              <IconRefresh size={26} stroke={2.2} />
            ) : (
              <IconPlayerPlayFilled size={26} />
            )}
          </button>
          <p className="max-w-sm text-[13px] font-bold text-stage-text">
            {requestLabel}
          </p>
          {status === "error" && (
            <p className="max-w-md text-[11px] leading-5 text-stage-muted">
              {statusText}
            </p>
          )}
        </div>
      )}

      {status === "working" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="stage-spinner h-9 w-9" />
          <p className="max-w-sm text-[13px] font-bold text-stage-text">
            {statusText}
          </p>
        </div>
      )}

      {status === "ready" && state.waiting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="stage-spinner h-9 w-9" />
        </div>
      )}

      {flash && (
        <span
          key={flash.id}
          className="stage-flash pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/70 px-4 py-2 font-mono text-sm font-bold text-stage-text"
        >
          {flash.text}
        </span>
      )}

      {chapters.length > 0 && (
        <button
          ref={skipRef}
          type="button"
          className="stage-skip"
          onClick={() => {
            if (skippable) seekTo(skippable.end);
            wake();
          }}
        >
          Skip {skippable?.label ?? ""}
          <IconChevronRight size={15} stroke={2.4} />
        </button>
      )}

      {upNext && (
        <UpNext
          episode={upNext.episode}
          subscribe={subscribeTime}
          onPlay={upNext.onPlay}
        />
      )}

      {episodesOpen && episodePanel}

      <div className="stage-chrome">
        <ScrubBar
          subscribe={subscribeTime}
          onSeek={seekTo}
          onScrubbingChange={holdAwake}
        />

        <div className="mt-1 flex items-center gap-1">
          <StageButton
            label={state.playing ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {state.playing ? (
              <IconPlayerPauseFilled size={19} />
            ) : (
              <IconPlayerPlayFilled size={19} />
            )}
          </StageButton>
          {onNextEpisode && (
            <StageButton label="Next episode" onClick={onNextEpisode}>
              <IconPlayerTrackNextFilled size={17} />
            </StageButton>
          )}
          <StageButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <IconRewindBackward10 size={19} stroke={1.9} />
          </StageButton>
          <StageButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <IconRewindForward10 size={19} stroke={1.9} />
          </StageButton>

          <div className="stage-volume-group">
            <StageButton
              label={state.muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              <VolumeIcon size={19} stroke={1.9} />
            </StageButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              aria-label="Volume"
              onChange={(event) => setVolume(Number(event.target.value))}
              className="stage-volume"
              style={{
                ["--level" as string]: `${(state.muted ? 0 : state.volume) * 100}%`,
              }}
            />
          </div>

          <Timecode subscribe={subscribeTime} />

          <div className="ml-auto flex items-center gap-0.5">
            {captions.length > 0 && (
              <StageMenu
                label="Subtitles"
                icon={<IconBadgeCc size={19} stroke={1.9} />}
                options={[
                  { value: CAPTIONS_OFF, label: "Off" },
                  ...captions.map((label, index) => ({
                    value: String(index),
                    label,
                  })),
                ]}
                value={caption}
                onValueChange={changeCaption}
                onOpenChange={holdAwake}
              />
            )}
            {episodePanel && (
              <StageButton
                label="Episodes"
                onClick={() => onEpisodesOpenChange?.(!episodesOpen)}
              >
                <IconLayoutList size={19} stroke={1.9} />
              </StageButton>
            )}
            {sources && sources.options.length > 0 && (
              <StageMenu
                label="Source"
                icon={<IconBroadcast size={19} stroke={1.9} />}
                options={sources.options}
                value={sources.value}
                onValueChange={sources.onChange}
                onOpenChange={holdAwake}
              />
            )}
            {quality && quality.options.length > 1 && (
              <StageMenu
                label="Quality"
                icon={<IconSettings size={19} stroke={1.9} />}
                summary={quality.summary}
                options={quality.options}
                value={quality.value}
                onValueChange={quality.onChange}
                onOpenChange={holdAwake}
              />
            )}
            {canPictureInPicture && (
              <StageButton
                label="Picture in picture"
                onClick={togglePictureInPicture}
              >
                <IconPictureInPicture size={19} stroke={1.9} />
              </StageButton>
            )}
            <StageButton
              label={state.fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {state.fullscreen ? (
                <IconMinimize size={19} stroke={1.9} />
              ) : (
                <IconMaximize size={19} stroke={1.9} />
              )}
            </StageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Subscribes to the playhead directly and writes it to the DOM. Rendering the
 * timecode through React would drag the whole chrome along with it once a
 * second.
 */
function Timecode({
  subscribe,
}: {
  subscribe: (listener: TimeListener) => () => void;
}) {
  const currentRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      subscribe(({ currentTime, duration }) => {
        if (currentRef.current) {
          currentRef.current.textContent = formatTimecode(currentTime);
        }
        if (totalRef.current) {
          totalRef.current.textContent = formatTimecode(duration);
        }
      }),
    [subscribe]
  );

  return (
    <p className="ml-1 font-mono text-[11px] tabular-nums text-stage-muted">
      <span ref={currentRef} className="text-stage-text">
        0:00
      </span>
      {" / "}
      <span ref={totalRef}>0:00</span>
    </p>
  );
}

function StageButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text ${
        className || "flex"
      }`}
    >
      {children}
    </button>
  );
}
