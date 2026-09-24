"use client";

import { type ReactNode, useEffect, useRef } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
} from "@phosphor-icons/react/ssr";

import { PLAYER_SEEK_SECONDS, type StageFeedback } from "./use-stage-playback";

const FILLED_ICON = { weight: "fill" as const };

function SeekTenIcon({ direction }: { direction: "back" | "forward" }) {
  const Arrow = direction === "back" ? ArrowCounterClockwise : ArrowClockwise;
  return (
    <span className="relative inline-flex size-[30px] items-center justify-center" aria-hidden="true">
      <Arrow {...FILLED_ICON} size={30} className="shrink-0" />
      <span className="absolute pt-0.5 text-[8px] font-bold leading-none">{PLAYER_SEEK_SECONDS}</span>
    </span>
  );
}

export function StageControl({
  label,
  onClick,
  className = "",
  expanded,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  expanded?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      disabled={disabled}
      className={`stage-control ${className}`}
    >
      {children}
    </button>
  );
}

export function StageTransport({
  playing,
  feedback,
  waiting = false,
  onTogglePlay,
  onSeekBack,
  onSeekForward,
}: {
  playing: boolean;
  feedback?: StageFeedback | null;
  waiting?: boolean;
  onTogglePlay: () => void;
  onSeekBack?: () => void;
  onSeekForward?: () => void;
}) {
  const notchRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const notch = notchRef.current;
    const label = labelRef.current;
    if (!notch || !label || !feedback) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 0 : parseFloat(
      getComputedStyle(label).getPropertyValue("--text-swap-dur"),
    );
    let swapTimer: number | undefined;
    const reveal = () => {
      label.textContent = feedback.text;
      label.classList.remove("is-exit");
      label.classList.add("is-enter-start");
      void label.offsetHeight;
      label.classList.remove("is-enter-start");
      notch.dataset.state = "b";
    };

    if (notch.dataset.state === "b" && label.textContent === feedback.text) {
      // Holding a seek key extends the feedback without repeatedly hiding it.
      label.classList.remove("is-exit");
    } else if (notch.dataset.state === "b" && !reducedMotion && !label.classList.contains("is-exit")) {
      label.classList.add("is-exit");
      swapTimer = window.setTimeout(reveal, duration);
    } else {
      reveal();
    }
    const holdTimer = window.setTimeout(() => {
      notch.dataset.state = "a";
    }, 1100);
    return () => {
      window.clearTimeout(swapTimer);
      window.clearTimeout(holdTimer);
    };
  }, [feedback]);

  return (
    <div className="stage-transport">
      <div ref={notchRef} className="stage-transport-controls t-icon-swap" data-state="a">
        {onSeekBack && (
          <StageControl label={`Back ${PLAYER_SEEK_SECONDS} seconds`} onClick={onSeekBack}>
            <span className="t-icon" data-icon="a" aria-hidden="true">
              <SeekTenIcon direction="back" />
            </span>
          </StageControl>
        )}
        <StageControl
          label={playing ? "Pause" : "Play"}
          className="stage-transport-play"
          onClick={onTogglePlay}
        >
          <span className="t-icon" data-icon="a" aria-hidden="true">
            {waiting ? <span className="stage-spinner size-8" /> : playing ? <Pause {...FILLED_ICON} size={40} className="shrink-0" /> : <Play {...FILLED_ICON} size={40} className="shrink-0" />}
          </span>
        </StageControl>
        {onSeekForward && (
          <StageControl label={`Forward ${PLAYER_SEEK_SECONDS} seconds`} onClick={onSeekForward}>
            <span className="t-icon" data-icon="a" aria-hidden="true">
              <SeekTenIcon direction="forward" />
            </span>
          </StageControl>
        )}
        <div className="stage-transport-feedback t-icon" data-icon="b">
          <span ref={labelRef} className="t-text-swap" role="status" aria-live="polite" aria-atomic="true" />
        </div>
      </div>
    </div>
  );
}

export function StageChrome({
  ready,
  title,
  playing,
  muted,
  volume,
  fullscreen,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  timeline,
  timecode,
  leftExtra,
  rightExtra,
}: {
  ready: boolean;
  title: string;
  playing: boolean;
  muted: boolean;
  volume: number;
  fullscreen: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
  timeline?: ReactNode;
  timecode?: ReactNode;
  leftExtra?: ReactNode;
  rightExtra?: ReactNode;
}) {
  const VolumeIcon = muted || volume === 0 ? SpeakerSlash : volume < 0.5 ? SpeakerLow : SpeakerHigh;
  return (
    <div className="stage-chrome">
      {ready && timeline}
      <div className="stage-controls">
        <div className="stage-controls-left">
          {ready ? (
            <>
              <StageControl label={playing ? "Pause" : "Play"} onClick={onTogglePlay} className="stage-toolbar-play">
                {playing ? <Pause {...FILLED_ICON} size={22} /> : <Play {...FILLED_ICON} size={22} />}
              </StageControl>
              {leftExtra}
              <div className="stage-volume-group">
                <StageControl label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
                  <VolumeIcon {...FILLED_ICON} size={22} />
                </StageControl>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                  className="stage-volume"
                  style={{ ["--level" as string]: `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>
              {timecode}
            </>
          ) : (
            <span className="stage-ready-label">{title}</span>
          )}
        </div>
        <div className="stage-controls-right">
          {rightExtra}
          <StageControl label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onToggleFullscreen}>
            {fullscreen ? <ArrowsIn {...FILLED_ICON} size={22} /> : <ArrowsOut {...FILLED_ICON} size={22} />}
          </StageControl>
        </div>
      </div>
    </div>
  );
}
