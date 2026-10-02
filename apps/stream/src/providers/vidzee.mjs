import { normalizeAudioLanguage } from "../media-language.mjs";
import { normalizeVariants } from "./normalize.mjs";

const API_ORIGIN = "https://core.vidzee.wtf";
const MAX_JSON_BYTES = 16 * 1024;
const MAX_PLAYLIST_BYTES = 256 * 1024;
const ALLOWED_MEDIA_HOSTS = new Set(["img1.hscow.com", "img.hscow.com"]);

export class VidzeeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VidzeeError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? null;
  }
}

function validateMedia(media) {
  if (media?.type !== "movie" && media?.type !== "tv") {
    throw new TypeError('media.type must be "movie" or "tv"');
  }
  if (!Number.isSafeInteger(media.tmdbId) || media.tmdbId <= 0) {
    throw new TypeError("media.tmdbId must be a positive integer");
  }
  if (
    media.type === "tv" &&
    (!Number.isSafeInteger(media.season) || media.season < 0 ||
      !Number.isSafeInteger(media.episode) || media.episode <= 0)
  ) {
    throw new TypeError("TV media requires valid season and episode numbers");
  }
}

function requestUrl(media) {
  const path = media.type === "tv"
    ? `/streams/tv/${media.tmdbId}/${media.season}/${media.episode}`
    : `/streams/movie/${media.tmdbId}`;
  const url = new URL(path, API_ORIGIN);
  url.searchParams.set("s", "v6:Hindi");
  url.searchParams.set("e", "0");
  return url;
}

async function readLimited(response, limit, stage) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new VidzeeError(`Source returned HTTP ${response.status} at ${stage}`, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { stage },
    });
  }
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel().catch(() => {});
    throw new VidzeeError(`Source response was too large at ${stage}`, {
      details: { stage },
    });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        throw new VidzeeError(`Source response was too large at ${stage}`, {
          details: { stage },
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function parseVidzeeStream(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new VidzeeError("Source returned invalid stream data", {
      details: { stage: "api" },
    });
  }
  let url;
  try {
    url = new URL(payload?.url);
  } catch {
    throw new VidzeeError("Source did not find a stream", {
      details: { stage: "api" },
    });
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.hash ||
    !ALLOWED_MEDIA_HOSTS.has(url.hostname) ||
    !/^\/hls_mps\/[a-f0-9]{32,64}\/\d{3,4}\/[^/]+\.m3u8$/i.test(url.pathname)
  ) {
    throw new VidzeeError("Source returned an unsupported media URL", {
      details: { stage: "api" },
    });
  }
  return url;
}

function browserCanRead(response, origin) {
  if (!origin) return true;
  const allowed = response.headers.get("access-control-allow-origin");
  return allowed === "*" || allowed === origin;
}

export async function resolveVidzee(media, options = {}) {
  validateMedia(media);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const startedAt = performance.now();
  let api;
  try {
    api = await fetchImpl(requestUrl(media), {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new VidzeeError("Source API request failed", {
      cause, retryable: true, details: { stage: "api" },
    });
  }
  const url = parseVidzeeStream(await readLimited(api, MAX_JSON_BYTES, "api"));
  let playlist;
  try {
    playlist = await fetchImpl(url, {
      headers: {
        accept: "application/vnd.apple.mpegurl",
        ...(options.proxyOrigin ? { origin: options.proxyOrigin } : {}),
      },
      redirect: "manual",
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new VidzeeError("Source playlist request failed", {
      cause, retryable: true, details: { stage: "playlist" },
    });
  }
  if (!browserCanRead(playlist, options.proxyOrigin)) {
    await playlist.body?.cancel().catch(() => {});
    throw new VidzeeError("Source playlist blocks browser access", {
      details: { stage: "playlist" },
    });
  }
  const manifest = await readLimited(playlist, MAX_PLAYLIST_BYTES, "playlist");
  if (!manifest.trimStart().startsWith("#EXTM3U")) {
    throw new VidzeeError("Source returned an invalid HLS playlist", {
      details: { stage: "playlist" },
    });
  }
  const preferred = normalizeAudioLanguage(media.audioLanguage);
  return {
    variants: [{
      url: url.href,
      type: "hls",
      deliveryMode: "native-direct",
      audioLanguages: preferred === "en" ? [] : ["hi"],
      // The playlist omits audio declarations. hls.js selects the first AAC
      // program, so its TS program map must be ordered in the browser.
      embeddedAudioLanguage: preferred === "en" ? "en" : undefined,
    }],
    subtitles: [],
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

export function createVidzeeResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveVidzee(media, options);
    return {
      candidates: normalizeVariants(result.variants, id),
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
