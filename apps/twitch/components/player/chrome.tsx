"use client";

import { ChatCircle, Monitor, Timer } from "@phosphor-icons/react/ssr";
import { ScrubBar, SleepTimerPicker, StageChrome, StageControl, StageSettings, useSleepTimer } from "@phantom/ui";
import type { PlaybackSegment, SegmentAppearances, SettingsSection } from "@phantom/ui";
import type { RefObject } from "react";
import { formatTime } from "@/lib/format";
import type { MediaState } from "./use-media";
import type { HlsState } from "./use-hls";
import type { Timeline } from "./use-timeline";
import type { Display } from "./use-display";
import { SPEEDS } from "./use-controls";
import type { Controls } from "./use-controls";

interface ChromeProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
  isLive: boolean;
  chatOpen: boolean;
  onChatToggle?: () => void;
  segments: readonly PlaybackSegment[];
  segmentAppearances?: SegmentAppearances;
  media: MediaState;
  hls: HlsState;
  timeline: Timeline;
  display: Display;
  controls: Controls;
}

const FILLED_ICON = { weight: "fill" as const };

export function Chrome({ videoRef, title, isLive, chatOpen, onChatToggle, segments, segmentAppearances,
  media, hls, timeline, display, controls }: ChromeProps) {
  const { playing, muted, volume, loading, currentTime, duration, speed, toggleMute, changeVolume } = media;
  const { levels, currentLevel } = hls;
  const { hasTimeline, useDvrTimeline, liveLag } = timeline;
  const { isFullscreen, pipSupported, togglePip } = display;
  const { togglePlay, toggleFullscreen, seekWithFeedback, showControls, changeSpeed,
    settingsOpen, setSettingsOpen, sleepTimerOpen, changeSleepTimerOpen } = controls;
  const sleepTimer = useSleepTimer(videoRef);
  const changeQuality = (level: number) => {
    hls.changeQuality(level);
    setSettingsOpen(false);
  };
  const seekToLive = () => {
    timeline.seekToLive();
    showControls();
  };

  const settingsSections: SettingsSection[] = [
    ...(levels.length > 0 ? [{
      id: "quality",
      title: "Quality",
      options: [
        { value: "auto", label: "Automatic" },
        ...levels.map((level) => ({ value: String(level.index), label: level.name })),
      ],
      value: currentLevel === -1 ? "auto" : String(currentLevel),
      onChange: (value: string) => changeQuality(value === "auto" ? -1 : Number(value)),
      summary: currentLevel === -1 ? "Automatic" : levels.find((level) => level.index === currentLevel)?.name,
    }] : []),
    ...(!isLive ? [{
      id: "speed",
      title: "Playback speed",
      options: SPEEDS.map((value) => ({ value: String(value), label: value === 1 ? "Normal" : `${value}×` })),
      value: String(speed),
      onChange: (value: string) => changeSpeed(Number(value)),
      summary: speed === 1 ? "Normal" : `${speed}×`,
    }] : []),
  ];

  return (
    <>
      <StageChrome
        ready={hasTimeline || !loading}
        title={title}
        playing={playing}
        muted={muted}
        volume={volume}
        fullscreen={isFullscreen}
        onTogglePlay={togglePlay}
        onToggleMute={toggleMute}
        onVolumeChange={changeVolume}
        onToggleFullscreen={toggleFullscreen}
        timeline={hasTimeline ? (
          <ScrubBar
            segments={segments}
            segmentAppearances={segmentAppearances}
            timelineStart={timeline.timelineStart}
            onSeekStep={seekWithFeedback}
            subscribe={timeline.subscribe}
            onSeek={timeline.seek}
            onScrubbingChange={(scrubbing) => { if (scrubbing) showControls(); }}
          />
        ) : undefined}
        timecode={
          <p className="stage-timecode">
            {isLive && !useDvrTimeline
              ? "Live"
              : <><span className="text-stage-text">{useDvrTimeline ? `-${formatTime(liveLag)}` : formatTime(currentTime)}</span><span className="stage-duration"> / {useDvrTimeline ? "Live" : formatTime(duration)}</span></>}
          </p>
        }
        rightExtra={
          <>
            {useDvrTimeline && liveLag > 3 && (
              <button type="button" onClick={seekToLive} className="stage-control min-w-11 text-[12px] font-medium" aria-label="Jump to live">Live</button>
            )}
            <StageControl
              label={sleepTimer.minutes === null ? "Sleep timer" : `Sleep timer, ${sleepTimer.minutesLeft} minutes left`}
              onClick={controls.openSleepTimer}
              expanded={sleepTimerOpen}
              className={`stage-sleep-trigger ${sleepTimer.minutes !== null ? "stage-sleep-trigger-active" : ""}`}
            >
              <Timer {...FILLED_ICON} size={22} />
            </StageControl>
            {onChatToggle && !isFullscreen && <StageControl label={chatOpen ? "Hide chat" : "Show chat"} onClick={onChatToggle} expanded={chatOpen}>
              <ChatCircle {...FILLED_ICON} size={22} />
            </StageControl>}
            <StageSettings
              sections={settingsSections}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              actions={pipSupported ? [{ label: "Picture in picture", icon: <Monitor {...FILLED_ICON} size={20} />, onClick: togglePip }] : []}
            />
          </>
        }
      />
      <SleepTimerPicker
        open={sleepTimerOpen}
        onOpenChange={changeSleepTimerOpen}
        minutes={sleepTimer.minutes}
        minutesLeft={sleepTimer.minutesLeft}
        onChange={sleepTimer.setMinutes}
      />
    </>
  );
}
