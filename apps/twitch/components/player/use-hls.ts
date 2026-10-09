"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import Hls from "hls.js";
import type { ResolvedQuality } from "@/lib/validation";
import type { MediaState } from "./use-media";

interface HlsOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  qualities: ResolvedQuality[];
  isLive: boolean;
  dvrMode: boolean;
  startTime: number;
  media: MediaState;
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

export function useHls({ videoRef, src, qualities, isLive, dvrMode, startTime, media }: HlsOptions) {
  const { syncDisplayedTime, setLoading, setSeekableStart, setSeekableEnd } = media;
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ name: string; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const debugVideo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resetVideo = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

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
        resetVideo();
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
    let levelsSynced = false;

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
      levelsSynced = filteredLevels.length > 0;
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
        // An archive is opened to catch up, so it starts from the beginning. Only the plain live stream starts at the edge.
        hls.startLoad(dvrMode ? startTime : startTime > 0 ? startTime : -1);
      }
      if (!isLive && startTime > 0) {
        video.currentTime = startTime;
        syncDisplayedTime(startTime);
      }
      setLoading(false);
    });

    hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
      if (!levelsSynced && hls.levels.length > 0) {
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
      resetVideo();
    };
  }, [videoRef, debugVideo, dvrMode, isLive, qualities, src, startTime, syncDisplayedTime, setLoading, setSeekableStart, setSeekableEnd]);

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
  }, [videoRef, dvrMode]);

  return { levels, currentLevel, changeQuality };
}

export type HlsState = ReturnType<typeof useHls>;
