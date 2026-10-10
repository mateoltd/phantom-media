"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  ArrowsIn,
  ArrowsOut,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
} from "@phosphor-icons/react/ssr";

import { PLAYER_SEEK_SECONDS, type StageFeedback } from "./use-stage-playback";
import { SeekTenIcon } from "./seek-ten-icon";

const FILLED_ICON = { weight: "fill" as const };

/** Use the toolbar's icons and the app's shared icon transition. */
function PlaybackGlyph({ playing, waiting = false, size = 24 }: { playing: boolean; waiting?: boolean; size?: number }) {
  return (
    <span className="stage-playback-glyph" data-waiting={waiting} aria-hidden="true">
      <span className="stage-playback-symbols t-icon-swap" data-state={playing ? "b" : "a"}>
        <Play {...FILLED_ICON} size={size} className="t-icon" data-icon="a" />
        <Pause {...FILLED_ICON} size={size} className="t-icon" data-icon="b" />
      </span>
      <span className="stage-spinner stage-playback-waiting" />
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
  const [dismissedFeedback, setDismissedFeedback] = useState<number | null>(null);
  const activeFeedback = feedback && feedback.id !== dismissedFeedback ? feedback : null;

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setDismissedFeedback(feedback.id), feedback.action ? 700 : 1400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  return (
    <div className="stage-transport" data-feedback={activeFeedback ? "true" : undefined} data-playing={playing} data-waiting={waiting}>
      <div className="stage-transport-controls" role="group" aria-label="Playback controls">
        <span className="stage-transport-surface" aria-hidden="true" />
        {onSeekBack && (
          <StageControl label={`Back ${PLAYER_SEEK_SECONDS} seconds`} className="stage-transport-back" onClick={onSeekBack}>
            <SeekTenIcon direction="back" feedbackId={activeFeedback?.action === "seek-back" ? activeFeedback.id : undefined} />
          </StageControl>
        )}
        <StageControl
          label={playing ? "Pause" : "Play"}
          className="stage-transport-play"
          onClick={onTogglePlay}
        >
          <PlaybackGlyph playing={playing} waiting={waiting} />
        </StageControl>
        {onSeekForward && (
          <StageControl label={`Forward ${PLAYER_SEEK_SECONDS} seconds`} className="stage-transport-forward" onClick={onSeekForward}>
            <SeekTenIcon direction="forward" feedbackId={activeFeedback?.action === "seek-forward" ? activeFeedback.id : undefined} />
          </StageControl>
        )}
        {activeFeedback && !activeFeedback.action && (
          <span key={activeFeedback.id} className="stage-transport-notice" aria-hidden="true">{activeFeedback.text}</span>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{activeFeedback?.text}</span>
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
                <PlaybackGlyph playing={playing} size={22} />
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
