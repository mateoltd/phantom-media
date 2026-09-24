"use client";

import type { ReactNode } from "react";
import {
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";

function SeekTenIcon({ direction }: { direction: "back" | "forward" }) {
  const Arrow = direction === "back" ? RotateCcw : RotateCw;
  return (
    <span className="relative inline-flex size-[30px] items-center justify-center" aria-hidden="true">
      <Arrow size={30} strokeWidth={1.6} />
      <span className="absolute pt-0.5 text-[8px] font-bold leading-none">10</span>
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
  onTogglePlay,
  onSeekBack,
  onSeekForward,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  onSeekBack?: () => void;
  onSeekForward?: () => void;
}) {
  return (
    <div className="stage-transport">
      <div className="stage-transport-controls">
        {onSeekBack && (
          <StageControl label="Back 10 seconds" onClick={onSeekBack}>
            <SeekTenIcon direction="back" />
          </StageControl>
        )}
        <StageControl
          label={playing ? "Pause" : "Play"}
          className="stage-transport-play"
          onClick={onTogglePlay}
        >
          {playing ? <Pause size={46} strokeWidth={1.6} /> : <Play size={46} strokeWidth={1.6} />}
        </StageControl>
        {onSeekForward && (
          <StageControl label="Forward 10 seconds" onClick={onSeekForward}>
            <SeekTenIcon direction="forward" />
          </StageControl>
        )}
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
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="stage-chrome">
      {ready && timeline}
      <div className="stage-controls">
        <div className="stage-controls-left">
          {ready ? (
            <>
              <StageControl label={playing ? "Pause" : "Play"} onClick={onTogglePlay} className="stage-toolbar-play">
                {playing ? <Pause size={22} strokeWidth={1.5} /> : <Play size={22} strokeWidth={1.5} />}
              </StageControl>
              {leftExtra}
              <div className="stage-volume-group">
                <StageControl label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
                  <VolumeIcon size={22} strokeWidth={1.5} />
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
            {fullscreen ? <Minimize size={22} strokeWidth={1.5} /> : <Maximize size={22} strokeWidth={1.5} />}
          </StageControl>
        </div>
      </div>
    </div>
  );
}
