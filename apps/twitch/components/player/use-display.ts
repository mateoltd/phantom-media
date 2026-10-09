"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

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

export function useDisplay(containerRef: RefObject<HTMLDivElement | null>, videoRef: RefObject<HTMLVideoElement | null>) {
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  useEffect(() => {
    const onFullscreenChange = () =>
      setNativeFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, [videoRef]);

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
  }, [videoRef]);

  useEffect(() => {
    setPipSupported(
      "pictureInPictureEnabled" in document &&
        (document as Document & { pictureInPictureEnabled: boolean })
          .pictureInPictureEnabled
    );
  }, [videoRef]);

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
  }, [containerRef, videoRef]);

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
  }, [videoRef]);

  return { isFullscreen: nativeFullscreen, pipSupported, toggleFullscreen, togglePip };
}

export type Display = ReturnType<typeof useDisplay>;
