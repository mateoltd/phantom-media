"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ChatCircle, Monitor, Timer } from "@phosphor-icons/react/ssr";
import { ScrubBar, SleepTimerPicker, StageChrome, StageControl, StageSettings, StageTransport, useStagePlayback, useSleepTimer } from "@phantom/ui";
import type { SettingsSection, TimeListener, TimeSnapshot } from "@phantom/ui";
import { formatTime } from "@/lib/format";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
}

interface PlayerProps {
  src: string;
  qualities: Quality[];
  startTime?: number;
  isLive?: boolean;
  dvrMode?: boolean;
  onTimeUpdate?: (time: number) => void;
  title?: string;
  subtitle?: string;
  chatOpen?: boolean;
  onChatToggle?: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const FILLED_ICON = { weight: "fill" as const };

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};

type IOSFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

function getFullscreenElement() {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

function requestNativeFullscreen(element: FullscreenElement) {
  const request =
    element.requestFullscreen ??
    element.webkitRequestFullscreen ??
    element.webkitRequestFullScreen;

  return request?.call(element);
}

function exitNativeFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;
  const exit =
    document.exitFullscreen ??
    fullscreenDocument.webkitExitFullscreen ??
    fullscreenDocument.webkitCancelFullScreen;

  return exit?.call(document);
}

function pickInitialLevel(
  levels: { name: string; index: number }[],
  sourceLevels: Hls["levels"]
) {
  if (levels.length === 0) return -1;

  return levels.reduce((best, current) => {
    const bestLevel = sourceLevels[best.index];
    const currentLevel = sourceLevels[current.index];
    const bestBitrate = bestLevel?.bitrate ?? bestLevel?.maxBitrate ?? 0;
    const currentBitrate = currentLevel?.bitrate ?? currentLevel?.maxBitrate ?? 0;
    return currentBitrate > bestBitrate ? current : best;
  }, levels[0]).index;
}

function labelHlsLevel(level: Hls["levels"][number]) {
  const attrs = level.attrs as Record<string, string | undefined> | undefined;
  const twitchName =
    attrs?.["STABLE-VARIANT-ID"] ??
    attrs?.["IVS-NAME"] ??
    attrs?.VIDEO ??
    level.name;

  if (twitchName) {
    if (twitchName === "chunked") return "Source";
    return twitchName;
  }

  const frameRate = level.frameRate ? Math.round(level.frameRate) : 0;
  return level.height
    ? `${level.height}p${frameRate >= 50 ? frameRate : ""}`
    : "Quality";
}

export function Player({
  src,
  qualities,
  startTime = 0,
  isLive = false,
  dvrMode = false,
  onTimeUpdate,
  title = "Twitch video",
  subtitle,
  chatOpen = false,
  onChatToggle,
}: PlayerProps) {
  const debugVideo =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const levelsSyncedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekableStart, setSeekableStart] = useState(0);
  const [seekableEnd, setSeekableEnd] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [levels, setLevels] = useState<{ name: string; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sleepTimerOpen, setSleepTimerOpen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const sleepTimer = useSleepTimer(videoRef);

  const syncDisplayedTime = useCallback(
    (time: number) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    },
    [onTimeUpdate]
  );

  const clearSeekFrame = useCallback(() => {
    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current);
      seekFrameRef.current = null;
    }
  }, []);

  const clampTime = useCallback(
    (time: number) => {
      if (isLive && seekableEnd > seekableStart) {
        return Math.max(seekableStart, Math.min(time, seekableEnd));
      }
      if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
      return Math.max(0, Math.min(time, duration));
    },
    [duration, isLive, seekableEnd, seekableStart]
  );

  const commitSeek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const nextTime = clampTime(time);
      pendingSeekRef.current = nextTime;
      syncDisplayedTime(nextTime);
      clearSeekFrame();
      seekFrameRef.current = requestAnimationFrame(() => {
        seekFrameRef.current = null;
        if (!videoRef.current || pendingSeekRef.current === null) return;
        videoRef.current.currentTime = pendingSeekRef.current;
      });
    },
    [clampTime, clearSeekFrame, syncDisplayedTime]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const stored = localStorage.getItem("phantom-volume");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === "number" && parsed >= 0 && parsed <= 1) {
          video.volume = parsed;
          setVolume(parsed);
        }
      }
    } catch {}

    video.disableRemotePlayback = true;

    const onLoadedMetadata = () => {
      if (!isLive && startTime > 0) {
        video.currentTime = startTime;
        syncDisplayedTime(startTime);
      }
      setLoading(false);
    };

    if (debugVideo) {
      console.info("[phantom-hls] player init", {
        src,
        isLive,
        dvrMode,
        hlsSupported: Hls.isSupported(),
        nativeHls: video.canPlayType("application/vnd.apple.mpegurl"),
        providedQualities: qualities.map((quality) => quality.name),
      });
    }

    if (!Hls.isSupported()) {
      if (debugVideo) {
        console.info("[phantom-hls] using native hls fallback");
      }
      video.src = src;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: isLive && !dvrMode,
      capLevelToPlayerSize: true,
      startLevel: -1,
      autoStartLoad: !(isLive || dvrMode),
      backBufferLength: isLive && !dvrMode ? 15 : 30,
      maxBufferLength: isLive && !dvrMode ? 8 : 30,
      maxMaxBufferLength: isLive && !dvrMode ? 20 : 60,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 3,
      capLevelOnFPSDrop: isLive && !dvrMode,
      renderTextTracksNatively: false,
    });
    hlsRef.current = hls;
    levelsSyncedRef.current = false;

    const syncLevels = (sourceLevels = hls.levels) => {
      const hevcSupported =
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"');

      const filteredLevels = sourceLevels
        .map((level) => {
          const index = hls.levels.indexOf(level);
          const levelIndex = index >= 0 ? index : sourceLevels.indexOf(level);
          if (level.codecs?.startsWith("hev1") && !hevcSupported) return null;
          return { name: labelHlsLevel(level), index: levelIndex };
        })
        .filter((level): level is NonNullable<typeof level> => level !== null);

      setLevels(filteredLevels);
      levelsSyncedRef.current = filteredLevels.length > 0;
      if ((isLive || dvrMode) && filteredLevels.length > 0) {
        const actualLevels = hls.levels.length > 0 ? hls.levels : sourceLevels;
        const firstLevel = pickInitialLevel(filteredLevels, actualLevels);
        hls.currentLevel = firstLevel;
        hls.nextLevel = firstLevel;
        hls.loadLevel = firstLevel;
        hls.autoLevelCapping = -1;
        setCurrentLevel(firstLevel);
        if (debugVideo) {
          console.info("[phantom-hls] selected initial level", {
            level: firstLevel,
            levelInfo: hls.levels[firstLevel],
          });
        }
      } else {
        setCurrentLevel(-1);
      }
    };

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if (debugVideo) {
        console.info("[phantom-hls] manifest parsed", {
          isLive,
          levels: data.levels.map((level) => ({
            name: level.name,
            width: level.width,
            height: level.height,
            frameRate: level.frameRate,
            bitrate: level.bitrate,
            url: level.url?.[0],
          })),
        });
      }
      syncLevels(data.levels.length > 0 ? data.levels : hls.levels);
      if (isLive || dvrMode) {
        hls.startLoad(startTime > 0 ? startTime : -1);
      }
      if (!isLive && startTime > 0) {
        video.currentTime = startTime;
        syncDisplayedTime(startTime);
      }
      setLoading(false);
    });

    hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
      if (!levelsSyncedRef.current && hls.levels.length > 0) {
        syncLevels();
      }

      if (dvrMode && data.details.live && data.details.fragments.length > 0) {
        const first = data.details.fragments[0];
        const last = data.details.fragments[data.details.fragments.length - 1];
        const start = first.start;
        const end = last.start + last.duration;
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          if (debugVideo) {
            console.info("[phantom-hls] live window", {
              isLive,
              level: data.level,
              fragments: data.details.fragments.length,
              start,
              end,
              duration: end - start,
            });
          }
          setSeekableStart(start);
          setSeekableEnd(end);
        }
      }
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (debugVideo) {
        console.warn("[phantom-hls] error", data);
      }
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        hls.destroy();
        hlsRef.current = null;
      }
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [debugVideo, dvrMode, isLive, qualities, src, startTime, syncDisplayedTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      setControlsVisible(true);
    };
    const updateSeekable = () => {
      const ranges = video.seekable;
      if (ranges.length === 0) {
        setSeekableStart(0);
        setSeekableEnd(0);
        return;
      }

      setSeekableStart(ranges.start(0));
      setSeekableEnd(ranges.end(ranges.length - 1));
    };
    const onTime = () => {
      updateSeekable();
      const actualTime = video.currentTime;
      if (
        pendingSeekRef.current !== null &&
        Math.abs(actualTime - pendingSeekRef.current) < 0.35
      ) {
        pendingSeekRef.current = null;
      }
      syncDisplayedTime(actualTime);
    };
    const onDurationChange = () => {
      setDuration(video.duration || 0);
      updateSeekable();
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      updateSeekable();
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onPlaying = () => {
      setLoading(false);
      updateSeekable();
    };
    const onRateChange = () => setSpeed(video.playbackRate);
    const onSeeked = () => {
      pendingSeekRef.current = null;
      setLoading(false);
      updateSeekable();
      syncDisplayedTime(video.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setControlsVisible(true);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ended", onEnded);
    };
  }, [syncDisplayedTime]);

  const isFullscreen = nativeFullscreen;

  useEffect(() => {
    const onFullscreenChange = () =>
      setNativeFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current as IOSFullscreenVideo | null;
    if (!video) return;
    const onIOSFullscreenChange = () =>
      setNativeFullscreen(Boolean(video.webkitDisplayingFullscreen));
    video.addEventListener("webkitbeginfullscreen", onIOSFullscreenChange);
    video.addEventListener("webkitendfullscreen", onIOSFullscreenChange);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", onIOSFullscreenChange);
      video.removeEventListener("webkitendfullscreen", onIOSFullscreenChange);
    };
  }, []);

  useEffect(() => {
    setPipSupported(
      "pictureInPictureEnabled" in document &&
        (document as Document & { pictureInPictureEnabled: boolean })
          .pictureInPictureEnabled
    );
  }, []);

  useEffect(() => {
    return () => {
      clearSeekFrame();
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, [clearSeekFrame]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2600);
  }, []);

  const changeSleepTimerOpen = useCallback((open: boolean) => {
    setSleepTimerOpen(open);
    if (!open) showControls();
  }, [showControls]);

  const seekBy = useCallback(
    (delta: number) => {
      const base = pendingSeekRef.current ?? videoRef.current?.currentTime ?? currentTime;
      commitSeek(base + delta);
      showControls();
    },
    [commitSeek, currentTime, showControls]
  );

  const { feedback, togglePlayback: togglePlay, seekWithFeedback, handlePlaybackKey } = useStagePlayback(videoRef, seekBy);

  const seekToLive = useCallback(() => {
    if (seekableEnd <= seekableStart) return;
    commitSeek(seekableEnd - 1);
    showControls();
  }, [commitSeek, seekableEnd, seekableStart, showControls]);

  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, nextVolume));
    video.volume = clamped;
    video.muted = false;
    try {
      localStorage.setItem("phantom-volume", JSON.stringify(clamped));
    } catch {}
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current as IOSFullscreenVideo | null;
    if (!container) return;

    if (getFullscreenElement()) {
      Promise.resolve(exitNativeFullscreen()).catch(() => {});
      return;
    }

    if (video?.webkitDisplayingFullscreen) {
      video.webkitExitFullscreen?.();
      return;
    }

    const request = requestNativeFullscreen(container);
    if (request) {
      Promise.resolve(request).catch(() => video?.webkitEnterFullscreen?.());
    } else if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
    setSettingsOpen(false);
    showControls();
  }, [showControls]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    }) | null;
    if (!video || !video.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeed(rate);
    setSettingsOpen(false);
  }, []);

  const changeQuality = useCallback((level: number) => {
    if (hlsRef.current) {
      const hls = hlsRef.current;
      const video = videoRef.current;
      hls.currentLevel = level;
      hls.nextLevel = level;
      hls.loadLevel = level;
      setCurrentLevel(level);

      if (dvrMode && video && level >= 0) {
        const resumeAt = video.currentTime;
        hls.stopLoad();
        hls.startLoad(resumeAt);
        video.currentTime = resumeAt;
      }
    }
    setSettingsOpen(false);
  }, [dvrMode]);

  const onVideoClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFullscreen();
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      togglePlay();
    }, 220);
  }, [toggleFullscreen, togglePlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && (
          target.isContentEditable || target.closest("a, [role='slider'], [role='dialog']") ||
          (target.closest("button") && (
            !target.closest(".stage-transport, .stage-toolbar-play") || event.key === " " || event.key === "Enter"
          ))
        ))
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (handlePlaybackKey(event)) {
        showControls();
        return;
      }
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          changeVolume(video.volume + 0.1);
          showControls();
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume(video.volume - 0.1);
          showControls();
          break;
        case "m":
          if (event.repeat) return;
          event.preventDefault();
          toggleMute();
          showControls();
          break;
        case "f":
          if (event.repeat) return;
          event.preventDefault();
          toggleFullscreen();
          break;
        case "p":
          if (event.shiftKey && !event.repeat) {
            event.preventDefault();
            togglePip();
          }
          break;
        case ",":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index > 0) changeSpeed(SPEEDS[index - 1]);
          }
          break;
        case ".":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index < SPEEDS.length - 1) changeSpeed(SPEEDS[index + 1]);
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeSpeed, changeVolume, handlePlaybackKey, showControls, speed, toggleFullscreen, toggleMute, togglePip]);

  const dvrWindow = Math.max(0, seekableEnd - seekableStart);
  const liveWindow = dvrWindow;
  const useDvrTimeline =
    dvrMode && dvrWindow > 1 && (isLive || !Number.isFinite(duration) || duration <= 0);
  const hasTimeline =
    (!isLive && Number.isFinite(duration) && duration > 0) ||
    useDvrTimeline;
  const timelineDuration = useDvrTimeline ? dvrWindow : duration;
  const timelineTime = useDvrTimeline
    ? Math.max(0, Math.min(currentTime - seekableStart, liveWindow))
    : currentTime;
  const liveLag =
    useDvrTimeline && seekableEnd > 0 ? Math.max(0, seekableEnd - currentTime) : 0;
  const canSeek = !isLive || liveWindow > 1;

  const timeSnapshotRef = useRef<TimeSnapshot>({ currentTime: 0, duration: 0, bufferedTo: 0 });
  const timeListenersRef = useRef(new Set<TimeListener>());
  const subscribeTimeline = useCallback((listener: TimeListener) => {
    timeListenersRef.current.add(listener);
    listener(timeSnapshotRef.current);
    return () => { timeListenersRef.current.delete(listener); };
  }, []);
  useEffect(() => {
    const snapshot = {
      currentTime: timelineTime,
      duration: timelineDuration,
      bufferedTo: useDvrTimeline ? timelineTime : buffered,
    };
    timeSnapshotRef.current = snapshot;
    for (const listener of timeListenersRef.current) listener(snapshot);
  }, [buffered, timelineDuration, timelineTime, useDvrTimeline]);

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
    <div className="stage-frame twitch-stage-frame">
      <div
        ref={containerRef}
        className={`stage w-full ${playing && !controlsVisible && !sleepTimerOpen ? "stage-idle" : ""}`}
        tabIndex={0}
        role="region"
        aria-label={`${title} player`}
        onMouseMove={showControls}
        onTouchStart={showControls}
        onMouseLeave={() => {
          if (playing) {
            if (controlsTimer.current) clearTimeout(controlsTimer.current);
            setControlsVisible(false);
          }
        }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0"
          playsInline
          preload="metadata"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture={!pipSupported}
          onClick={onVideoClick}
        />
        <div className="stage-top">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium text-stage-text">{title}</p>
            {subtitle && <p className="mt-1 truncate text-[13px] text-stage-muted">{subtitle}</p>}
          </div>
        </div>
        <StageTransport
          playing={playing}
          feedback={feedback}
          waiting={loading}
          onTogglePlay={togglePlay}
          onSeekBack={canSeek ? () => seekWithFeedback(-1) : undefined}
          onSeekForward={canSeek ? () => seekWithFeedback(1) : undefined}
        />
        <StageChrome
          ready={!loading}
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
              onSeekStep={seekWithFeedback}
              subscribe={subscribeTimeline}
              onSeek={(time) => commitSeek(useDvrTimeline ? seekableStart + time : time)}
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
                onClick={() => {
                  setSettingsOpen(false);
                  setSleepTimerOpen(true);
                  showControls();
                }}
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
      </div>
    </div>
  );
}
