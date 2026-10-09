"use client";

import { useRef } from "react";
import { StageTransport } from "@phantom/ui";
import type { PlaybackSegment, SegmentAppearances } from "@phantom/ui";
import { EMPTY_PLAYBACK_SEGMENTS } from "@phantom/ui/playback-segments";
import type { ResolvedQuality } from "@/lib/validation";
import { Chrome } from "./player/chrome";
import { useMedia } from "./player/use-media";
import { useHls } from "./player/use-hls";
import { useTimeline } from "./player/use-timeline";
import { useDisplay } from "./player/use-display";
import { useControls } from "./player/use-controls";

interface PlayerProps {
  src: string;
  qualities: ResolvedQuality[];
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

export function Player({ src, qualities, segments = EMPTY_PLAYBACK_SEGMENTS, segmentAppearances,
  startTime = 0, isLive = false, dvrMode = false, onTimeUpdate, onPlaybackSeek,
  title = "Twitch video", subtitle, chatOpen = false, onChatToggle }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = useMedia({ videoRef, isLive, onTimeUpdate, onPlaybackSeek });
  const hls = useHls({ videoRef, src, qualities, startTime, isLive, dvrMode, media });
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
        <StageTransport playing={media.playing} feedback={controls.feedback} waiting={media.loading}
          onTogglePlay={controls.togglePlay}
          onSeekBack={timeline.canSeek ? () => controls.seekWithFeedback(-1) : undefined}
          onSeekForward={timeline.canSeek ? () => controls.seekWithFeedback(1) : undefined} />
        <Chrome videoRef={videoRef} title={title} isLive={isLive} chatOpen={chatOpen}
          onChatToggle={onChatToggle} segments={segments} segmentAppearances={segmentAppearances}
          media={media} hls={hls} timeline={timeline} display={display} controls={controls} />
      </div>
    </div>
  );
}
