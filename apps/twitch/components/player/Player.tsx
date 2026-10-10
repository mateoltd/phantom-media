"use client";

import { useEffect, useRef } from "react";
import { StageTransport } from "@phantom/ui";
import type { PlaybackSegment, SegmentAppearances } from "@phantom/ui";
import { EMPTY_PLAYBACK_SEGMENTS } from "@phantom/ui/playback-segments";
import { Chrome } from "./chrome";
import type { SourceSelection } from "./chrome";
import { useMedia } from "./use-media";
import { useHls } from "./use-hls";
import { useTimeline } from "./use-timeline";
import { useDisplay } from "./use-display";
import { useControls } from "./use-controls";

interface PlayerProps {
  src: string;
  delivery?: "hls" | "file";
  audioOnly?: boolean;
  onAudioOnlyChange?: (enabled: boolean) => void;
  sourceSelection?: SourceSelection;
  onMediaError?: (kind: "network" | "media") => void;
  onVideoSize?: (source: string, width: number, height: number) => void;
  seekRequest?: { position: number; revision: number };
  storyboardUrl?: string;
  segments?: readonly PlaybackSegment[];
  segmentAppearances?: SegmentAppearances;
  startTime?: number;
  isLive?: boolean;
  dvrMode?: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlaybackSeek?: () => void;
  title?: string;
  subtitle?: string;
  chatOpen?: boolean;
  onChatToggle?: () => void;
}

export function Player({ src, delivery = "hls", audioOnly = false, onAudioOnlyChange, sourceSelection, seekRequest, storyboardUrl, onMediaError, onVideoSize, segments = EMPTY_PLAYBACK_SEGMENTS, segmentAppearances,
  startTime = 0, isLive = false, dvrMode = false, onTimeUpdate, onPlaybackSeek,
  title = "Twitch video", subtitle, chatOpen = false, onChatToggle }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = useMedia({ videoRef, isLive, onTimeUpdate, onPlaybackSeek });
  const hls = useHls({ videoRef, src, delivery, audioOnly, startTime, isLive, dvrMode, media, onMediaError, onVideoSize });
  const { syncDisplayedTime } = media;
  useEffect(() => {
    if (seekRequest && videoRef.current) { videoRef.current.currentTime = seekRequest.position; syncDisplayedTime(seekRequest.position); }
  }, [seekRequest, syncDisplayedTime]);
  const timeline = useTimeline(media, isLive, dvrMode);
  const display = useDisplay(containerRef, videoRef);
  const controls = useControls(videoRef, media, display);

  return (
    <div className="stage-frame twitch-stage-frame">
      <div ref={containerRef} className={`stage w-full ${controls.idle ? "stage-idle" : ""}`}
        tabIndex={0} role="region" aria-label={`${title} player`}
        onMouseMove={controls.showControls} onTouchStart={controls.showControls}
        onMouseLeave={controls.hideControls}>
        <video ref={videoRef} className="absolute inset-0" playsInline preload="metadata"
          controlsList="nodownload noremoteplayback" disablePictureInPicture={!display.pipSupported}
          onClick={controls.onVideoClick} />
        <div className="stage-top">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium text-stage-text">{title}</p>
            {subtitle && <p className="mt-1 truncate text-[13px] text-stage-muted">{subtitle}</p>}
          </div>
        </div>
        {hls.error && <div role="alert" className="absolute inset-x-0 top-1/3 z-10 bg-black/80 p-4 text-center text-white">{hls.error}</div>}
        <StageTransport playing={media.playing} feedback={controls.feedback} waiting={media.loading}
          onTogglePlay={controls.togglePlay}
          onSeekBack={timeline.canSeek ? () => controls.seekWithFeedback(-1) : undefined}
          onSeekForward={timeline.canSeek ? () => controls.seekWithFeedback(1) : undefined} />
        <Chrome videoRef={videoRef} title={title} isLive={isLive} chatOpen={chatOpen}
          onChatToggle={onChatToggle} audioOnly={audioOnly} onAudioOnlyChange={onAudioOnlyChange} sourceSelection={sourceSelection} segments={segments} segmentAppearances={segmentAppearances} storyboardUrl={storyboardUrl}
          media={media} hls={hls} timeline={timeline} display={display} controls={controls} />
      </div>
    </div>
  );
}
