const DEFAULT_TIMEOUT_MS = 12_000;

function waitForVideo(video, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(reject, new Error("Timed out waiting for media metadata")),
      timeoutMs,
    );

    const onReady = () => finish(resolve);
    const onError = () =>
      finish(reject, video.error ?? new Error("The video element rejected the source"));

    function finish(callback, value) {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
      callback(value);
    }

    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function attachCandidate({ video, Hls, candidate, timeoutMs }) {
  if (candidate.type === "hls") {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = candidate.url;
      video.load();
      await waitForVideo(video, timeoutMs);
      return { destroy() {} };
    }
    if (!Hls?.isSupported?.()) {
      throw new Error("HLS is unsupported and no Hls.js constructor was supplied");
    }

    const hls = new Hls();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => finish(reject, new Error("Timed out loading the HLS manifest")),
        timeoutMs,
      );

      function finish(callback, value) {
        clearTimeout(timeout);
        hls.off(Hls.Events.MANIFEST_PARSED, onReady);
        hls.off(Hls.Events.ERROR, onError);
        callback(value);
      }

      const onReady = () => finish(resolve);
      const onError = (_event, data) => {
        if (data?.fatal) {
          finish(reject, new Error(data.details ?? "Fatal HLS error"));
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, onReady);
      hls.on(Hls.Events.ERROR, onError);
      hls.loadSource(candidate.url);
      hls.attachMedia(video);
    }).catch((error) => {
      hls.destroy();
      throw error;
    });

    return hls;
  }

  video.src = candidate.url;
  video.load();
  await waitForVideo(video, timeoutMs);
  return { destroy() {} };
}

/**
 * Resolve providers lazily and switch servers only when playback proves that
 * the current one is unusable. `resolveServer` should return the wrapper's
 * `{ candidates }` response for the requested alias.
 */
export async function playWithServerFallback(options) {
  const {
    video,
    Hls,
    servers,
    resolveServer,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    autoplay = false,
    onAttempt,
  } = options;

  if (!video || typeof resolveServer !== "function" || !servers?.length) {
    throw new TypeError("video, servers, and resolveServer are required");
  }

  const failures = [];

  for (const server of servers) {
    let result;
    try {
      result = await resolveServer(server);
    } catch (error) {
      failures.push({ server, stage: "resolve", error });
      onAttempt?.({ server, ok: false, stage: "resolve", error });
      continue;
    }

    for (const candidate of result.candidates ?? []) {
      try {
        const controller = await attachCandidate({
          video,
          Hls,
          candidate,
          timeoutMs,
        });
        if (autoplay) await video.play();
        onAttempt?.({ server, candidate, ok: true, stage: "playback" });
        return { server, candidate, controller, failures };
      } catch (error) {
        failures.push({ server, candidate, stage: "playback", error });
        onAttempt?.({
          server,
          candidate,
          ok: false,
          stage: "playback",
          error,
        });
      }
    }
  }

  throw new AggregateError(
    failures.map((failure) => failure.error),
    "Every server and source failed",
  );
}
