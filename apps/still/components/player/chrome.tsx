"use client";

import { ChatCircle, Monitor, Timer } from "@phosphor-icons/react/ssr";
import { ScrubBar, SleepTimerPicker, StageChrome, StageControl, StageSettings, useSleepTimer } from "@phantom/ui";
import type { PlaybackSegment, SegmentAppearances, SettingsSection } from "@phantom/ui";
import type { RefObject } from "react";
import { formatTime } from "@/lib/format";
import type { MediaState } from "./use-media";
import type { HlsState } from "./use-hls";
import type { Captions } from "./use-captions";
import type { Timeline } from "./use-timeline";
import type { Display } from "./use-display";
import { SPEEDS } from "./use-controls";
import type { Controls } from "./use-controls";
import { useStoryboardPreview } from "@/components/previews/use-storyboard-preview";

export interface SourceSelection {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

interface ChromeProps {
  audioOnly: boolean;
  onAudioOnlyChange?: (enabled: boolean) => void;
  sourceSelection?: SourceSelection;
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
  isLive: boolean;
  chatOpen: boolean;
  onChatToggle?: () => void;
  segments: readonly PlaybackSegment[];
  segmentAppearances?: SegmentAppearances;
  storyboardUrl?: string;
  media: MediaState;
  hls: HlsState;
  captions: Captions;
  timeline: Timeline;
  display: Display;
  controls: Controls;
}

const FILLED_ICON = { weight: "fill" as const };

export function Chrome({ videoRef, title, isLive, chatOpen, onChatToggle, segments, segmentAppearances, storyboardUrl, audioOnly, onAudioOnlyChange, sourceSelection,
  media, hls, captions, timeline, display, controls }: ChromeProps) {
  const { playing, muted, volume, loading, currentTime, duration, speed, toggleMute, changeVolume } = media;
  const { levels, currentLevel } = hls;
  const { hasTimeline, useDvrTimeline, liveLag } = timeline;
  const { isFullscreen, pipSupported, togglePip } = display;
  const { togglePlay, toggleFullscreen, seekWithFeedback, showControls, changeSpeed,
    menu, changeMenu } = controls;
  const sleepTimer = useSleepTimer(videoRef);
  const { preview, onPreview } = useStoryboardPreview(storyboardUrl);
  const changeQuality = (level: number) => {
    hls.changeQuality(level);
    changeMenu(null);
  };
  const seekToLive = () => {
    if (useDvrTimeline) timeline.seekToLive();
    else hls.jumpToLive();
    showControls();
  };

  const settingsSections: SettingsSection[] = [
    ...(onAudioOnlyChange ? [{
      id: "mode", title: "Playback", value: audioOnly ? "audio" : "video",
      options: [{ value: "video", label: "Video" }, { value: "audio", label: "Audio only" }],
      onChange: (value: string) => { onAudioOnlyChange(value === "audio"); changeMenu(null); },
    }] : []),
    ...(!audioOnly && sourceSelection ? [{
      id: "quality", title: "Quality", options: sourceSelection.options, value: sourceSelection.value,
      onChange: (value: string) => { sourceSelection.onChange(value); changeMenu(null); },
    }] : !audioOnly && levels.length > 0 ? [{
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
    ...(captions.tracks.length > 0 ? [{
      id: "captions",
      title: "Captions",
      options: [
        { value: "off", label: "Off" },
        ...captions.tracks.map((track) => ({ value: track, label: captions.tracks.length === 1 ? "On" : track })),
      ],
      value: captions.selected ?? "off",
      onChange: (value: string) => { captions.select(value === "off" ? null : value); changeMenu(null); },
      summary: captions.selected === null ? "Off" : captions.tracks.length === 1 ? "On" : captions.selected,
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
            preview={preview}
            onPreview={onPreview}
          />
        ) : undefined}
        timecode={
          <p className="stage-timecode">
            {isLive && !useDvrTimeline
              ? hls.behindLive ? "Behind live" : "Live"
              : <><span className="text-stage-text">{useDvrTimeline ? `-${formatTime(liveLag)}` : formatTime(currentTime)}</span><span className="stage-duration"> / {useDvrTimeline ? "Live" : formatTime(duration)}</span></>}
          </p>
        }
        rightExtra={
          <>
            {(useDvrTimeline && liveLag > 3 || isLive && !useDvrTimeline && hls.behindLive) && (
              <button type="button" onClick={seekToLive} className="stage-control stage-live-trigger min-w-11 text-[12px] font-medium" aria-label="Jump to live">Live</button>
            )}
            <StageControl
              label={sleepTimer.minutes === null ? "Sleep timer" : `Sleep timer, ${sleepTimer.minutesLeft} minutes left`}
              onClick={() => changeMenu(menu === "sleep" ? null : "sleep")}
              expanded={menu === "sleep"}
              className={`stage-sleep-trigger ${sleepTimer.minutes !== null ? "stage-sleep-trigger-active" : ""}`}
            >
              <Timer {...FILLED_ICON} size={22} />
            </StageControl>
            {onChatToggle && !isFullscreen && <StageControl label={chatOpen ? "Hide chat" : "Show chat"} onClick={onChatToggle} expanded={chatOpen} className="stage-chat-trigger">
              <ChatCircle {...FILLED_ICON} size={22} />
            </StageControl>}
            <StageSettings
              sections={settingsSections}
              open={menu === "settings"}
              onOpenChange={open => changeMenu(open ? "settings" : null)}
              actions={pipSupported ? [{ label: "Picture in picture", icon: <Monitor {...FILLED_ICON} size={20} />, onClick: togglePip }] : []}
            />
          </>
        }
      />
      <SleepTimerPicker
        open={menu === "sleep"}
        onOpenChange={open => changeMenu(open ? "sleep" : null)}
        minutes={sleepTimer.minutes}
        minutesLeft={sleepTimer.minutesLeft}
        onChange={sleepTimer.setMinutes}
      />
    </>
  );
}
