import Script from "next/script";

const DEBUG_SCRIPT = `
(() => {
  const prefix = "[phantom-debug]";
  const watchedVideoElements = new WeakSet();
  const monitoredRequests = ["/api/vod/resolve", "/api/vod/master.m3u8", "/api/vod/media.m3u8", "/api/channel/resolve", "/api/channel/search", "/api/live/master.m3u8", "/api/live/media.m3u8"];

  const log = (message, details) => {
    if (details !== undefined) {
      console.debug(prefix + " " + message, details);
      return;
    }
    console.debug(prefix + " " + message);
  };

  const isRelevantUrl = (input) => {
    return monitoredRequests.some((path) => input.includes(path));
  };

  const formatBufferedEnd = (video) => {
    try {
      return video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : null;
    } catch {
      return null;
    }
  };

  const snapshot = (video) => ({
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    readyState: video.readyState,
    networkState: video.networkState,
    errorCode: video.error ? video.error.code : null,
    errorMessage: video.error ? video.error.message : null,
    bufferedEnd: formatBufferedEnd(video),
    src: video.currentSrc || video.src || null,
  });

  const watchVideo = (video) => {
    if (watchedVideoElements.has(video)) return;
    watchedVideoElements.add(video);

    ["loadstart", "loadedmetadata", "waiting", "stalled", "seeking", "seeked", "playing", "error", "ended"].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        log("video:" + eventName, snapshot(video));
      });
    });

    log("video:attached", snapshot(video));
  };

  const scan = () => {
    document.querySelectorAll("video").forEach((video) => watchVideo(video));
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].toString() : args[0] && "url" in args[0] ? args[0].url : "";
    const startedAt = performance.now();

    try {
      const response = await originalFetch(...args);
      if (isRelevantUrl(input) && !response.ok) {
        log("fetch:error", {
          url: input,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }
      return response;
    } catch (error) {
      if (isRelevantUrl(input)) {
        log("fetch:exception", {
          url: input,
          durationMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();
  log("probe-ready", { href: window.location.href });
})();
`;

export function DebugVideoScript() {
  return (
    <Script
      id="phantom-debug-video"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: DEBUG_SCRIPT }}
    />
  );
}
