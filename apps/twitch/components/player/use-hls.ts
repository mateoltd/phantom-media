"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { RefObject } from "react";
import Hls from "hls.js";
import type { MediaState } from "./use-media";

interface HlsOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  delivery: "hls" | "file";
  audioOnly: boolean;
  isLive: boolean;
  dvrMode: boolean;
  startTime: number;
  media: MediaState;
  onMediaError?: (kind: "network" | "media") => void;
  onVideoSize?: (source: string, width: number, height: number) => void;
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
    attrs?.NAME ?? level.name;

  if (twitchName) {
    if (twitchName === "chunked") return "Source";
    return twitchName;
  }

  const frameRate = level.frameRate ? Math.round(level.frameRate) : 0;
  return level.height
    ? `${level.height}p${frameRate >= 50 ? frameRate : ""}`
    : "Quality";
}

export function useHls({ videoRef, src, delivery, audioOnly, isLive, dvrMode, startTime, media, onMediaError, onVideoSize }: HlsOptions) {
  const { syncDisplayedTime, setLoading, setSeekableStart, setSeekableEnd } = media;
  const resumePlaying = useRef(false);
  const resumeTime = useRef<number | undefined>(undefined);
  const resumeSpeed = useRef(1);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ name: string; index: number }[]>([]);
  const [error, setError] = useState("");
  const reportError = useEffectEvent((kind: "network" | "media") => onMediaError?.(kind));
  const reportVideoSize = useEffectEvent((source: string, width: number, height: number) => onVideoSize?.(source, width, height));
  const [currentLevel, setCurrentLevel] = useState(-1);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resetVideo = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    let recoveries = 0;
    let metadataLoaded = false;
    const onVideoResize = () => {
      if (metadataLoaded && !audioOnly && video.videoWidth > 0 && video.videoHeight > 0) {
        reportVideoSize(src, video.videoWidth, video.videoHeight);
      }
    };
    const capturePlayback = () => {
      // Strict Mode can clean up before a source has loaded. That empty element
      // must not replace a deep link or the previous source's playback state.
      if (!metadataLoaded) return;
      resumePlaying.current = !video.paused;
      resumeTime.current = video.currentTime;
      resumeSpeed.current = video.playbackRate;
    };
    const onNativeError = () => { setError("Media is unavailable"); setLoading(false); reportError(video.error?.code === 2 ? "network" : "media"); };
    setError("");
    video.addEventListener("error", onNativeError);
    const onLoadedMetadata = () => {
      metadataLoaded = true;
      onVideoResize();
      if ((!isLive || dvrMode) && (resumeTime.current ?? startTime) > 0) {
        const position = resumeTime.current ?? startTime;
        video.currentTime = position;
        syncDisplayedTime(position);
      }
      setLoading(false);
      video.playbackRate = resumeSpeed.current;
      if (resumePlaying.current) void video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("resize", onVideoResize);
    if (delivery === "file" || !Hls.isSupported()) {
      video.src = src;
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("resize", onVideoResize);
        video.removeEventListener("error", onNativeError);
        capturePlayback();
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
      // Twitch does not say which language a caption channel carries, so the tracks are named after the channel.
      captionsTextTrack1Label: "CC1", captionsTextTrack1LanguageCode: "",
      captionsTextTrack2Label: "CC2", captionsTextTrack2LanguageCode: "",
      captionsTextTrack3Label: "CC3", captionsTextTrack3LanguageCode: "",
      captionsTextTrack4Label: "CC4", captionsTextTrack4LanguageCode: "",
    });
    hlsRef.current = hls;
    let levelsSynced = false;

    const syncLevels = (sourceLevels = hls.levels) => {
      const hevcSupported =
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"');

      const filteredLevels = sourceLevels
        .map((level) => {
          if (audioOnly || level.audioCodec && !level.videoCodec) return null;
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

      } else {
        setCurrentLevel(-1);
      }
    };

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {

      syncLevels(data.levels.length > 0 ? data.levels : hls.levels);
      if (isLive || dvrMode) {
        // An archive is opened to catch up, so it starts from the beginning. Only the plain live stream starts at the edge.
        hls.startLoad(dvrMode ? startTime : startTime > 0 ? startTime : -1);
      }
      if ((!isLive || dvrMode) && (resumeTime.current ?? startTime) > 0) {
        const position = resumeTime.current ?? startTime;
        video.currentTime = position;
        syncDisplayedTime(position);
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

          setSeekableStart(start);
          setSeekableEnd(end);
        }
      }
    });

    hls.on(Hls.Events.ERROR, (_, data) => {

      if (!data.fatal) return;
      if (recoveries++ >= 2) { setError("Media is unavailable"); setLoading(false); reportError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : "media"); hls.destroy(); hlsRef.current = null; return; }
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
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("resize", onVideoResize);
      video.removeEventListener("error", onNativeError);
      capturePlayback();
      hls.destroy();
      hlsRef.current = null;
      resetVideo();
    };
  }, [videoRef, dvrMode, isLive, delivery, audioOnly, src, startTime, syncDisplayedTime, setLoading, setSeekableStart, setSeekableEnd]);

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

  return { levels, currentLevel, changeQuality, error };
}

export type HlsState = ReturnType<typeof useHls>;
