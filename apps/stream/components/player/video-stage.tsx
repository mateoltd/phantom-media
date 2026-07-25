"use client";

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  IconBadgeCc,
  IconMaximize,
  IconMinimize,
  IconPictureInPicture,
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
import { ScrubBar } from "./scrub-bar";
import { StageMenu, type StageMenuOption } from "./stage-menu";
import { useVideoState } from "./use-video-state";

export type StageStatus = "idle" | "working" | "ready" | "error";

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
  qualities?: readonly StageMenuOption[];
  activeQuality?: string | null;
  onQualityChange?: (value: string) => void;
  /**
   * Subtitle choices, in the same order as `tracks`. The stage owns which one
   * is showing because track modes live on the media element, not in React.
   */
  captions?: readonly string[];
  /** `<track>` elements, which have to be children of the media element. */
  tracks?: ReactNode;
  children?: ReactNode;
}

const CAPTIONS_OFF = "off";

const IDLE_DELAY_MS = 2600;

export function VideoStage({
  videoRef,
  title,
  poster,
  status,
  statusText,
  onRequestPlayback,
  canRequestPlayback,
  requestLabel,
  qualities = [],
  activeQuality = null,
  onQualityChange,
  captions = [],
  tracks,
  children,
}: VideoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const [idle, setIdle] = useState(false);
  const [caption, setCaption] = useState(CAPTIONS_OFF);
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const {
    state,
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

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS);
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    scheduleIdle();
  }, [scheduleIdle]);

  // Playback starting is enough to begin the countdown; the pointer does not
  // have to move first. `chromeHidden` gates on `playing`, so a paused player
  // shows its controls whatever this timer last decided.
  useEffect(() => {
    if (!state.playing) return;
    scheduleIdle();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [state.playing, scheduleIdle]);

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

  const chromeHidden = idle && state.playing;
  const showPoster = Boolean(poster) && status !== "ready";
  const volumeIcon = state.muted || state.volume === 0
    ? IconVolumeOff
    : state.volume < 0.5
      ? IconVolume2
      : IconVolume;
  const VolumeIcon = volumeIcon;

  return (
    <div
      ref={containerRef}
      className={`stage aspect-video w-full rounded-2xl border border-stage-line/60 shadow-[0_24px_70px_rgba(31,25,17,0.28)] outline-none ${
        chromeHidden ? "stage-idle" : ""
      }`}
      tabIndex={0}
      role="region"
      aria-label={`${title} player`}
      onKeyDown={handleKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => state.playing && setIdle(true)}
    >
      {showPoster && poster && (
        <Image
          src={poster}
          alt=""
          fill
          sizes="(min-width: 1024px) 70vw, 100vw"
          unoptimized
          priority
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-stage via-stage/45 to-stage/70"
        aria-hidden="true"
      />

      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        className="absolute inset-0"
        onClick={() => status === "ready" && togglePlay()}
        onDoubleClick={toggleFullscreen}
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

      <div
        className={`stage-chrome ${chromeHidden ? "stage-chrome-hidden" : ""}`}
      >
        <ScrubBar
          currentTime={state.currentTime}
          duration={state.duration}
          bufferedTo={state.bufferedTo}
          onSeek={seekTo}
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
          <StageButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <IconRewindBackward10 size={19} stroke={1.9} />
          </StageButton>
          <StageButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <IconRewindForward10 size={19} stroke={1.9} />
          </StageButton>

          <div className="stage-volume-group flex items-center gap-1 pr-1">
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

          <p className="ml-1 font-mono text-[11px] text-stage-muted">
            <span className="text-stage-text">
              {formatTimecode(state.currentTime)}
            </span>
            {" / "}
            {formatTimecode(state.duration)}
          </p>

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
              />
            )}
            {qualities.length > 0 && onQualityChange && (
              <StageMenu
                label="Stream quality"
                icon={<IconSettings size={19} stroke={1.9} />}
                summary={
                  qualities.find((option) => option.value === activeQuality)
                    ?.label
                }
                options={qualities}
                value={activeQuality}
                onValueChange={onQualityChange}
              />
            )}
            {typeof document !== "undefined" &&
              document.pictureInPictureEnabled && (
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

function StageButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text"
    >
      {children}
    </button>
  );
}
