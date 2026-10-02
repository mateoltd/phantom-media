import { hlsAudioLanguages } from "../media-language.mjs";
import { normalizeVariants } from "./normalize.mjs";

const ORIGIN = "https://vixsrc.to";
const MAX_API_BYTES = 16 * 1024;
const MAX_PAGE_BYTES = 128 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_EMBED_AGE_MS = 60 * 60 * 1_000;
const MAX_PLAYLIST_AGE_MS = 90 * 24 * 60 * 60 * 1_000;

export class VixsrcError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VixsrcError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? null;
  }
}

function assertMedia(media) {
  if (media?.type !== "movie" && media?.type !== "tv") {
    throw new TypeError('media.type must be "movie" or "tv"');
  }
  if (!Number.isSafeInteger(Number(media.tmdbId)) || Number(media.tmdbId) <= 0) {
    throw new TypeError("media.tmdbId must be a positive integer");
  }
  if (
    media.type === "tv" &&
    (!Number.isSafeInteger(Number(media.season)) ||
      !Number.isSafeInteger(Number(media.episode)) ||
      Number(media.season) < 0 ||
      Number(media.episode) <= 0)
  ) {
    throw new TypeError("TV media requires valid season and episode numbers");
  }
}

function apiUrl(media) {
  return new URL(
    media.type === "tv"
      ? `/api/tv/${Number(media.tmdbId)}/${Number(media.season)}/${Number(media.episode)}`
      : `/api/movie/${Number(media.tmdbId)}`,
    ORIGIN,
  );
}

async function fetchText(fetchImpl, url, signal, limit, stage) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: stage === "playlist" ? "application/vnd.apple.mpegurl" : "text/html,application/json" },
      redirect: "manual",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new VixsrcError(`Source request failed at ${stage}`, {
      cause: error,
      retryable: true,
      details: { stage },
    });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new VixsrcError(`Source returned HTTP ${response.status} at ${stage}`, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { stage },
    });
  }
  const length = Number(response.headers.get("content-length"));
  if (length > limit) {
    await response.body?.cancel().catch(() => {});
    throw new VixsrcError(`Source response was too large at ${stage}`, {
      details: { stage },
    });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new VixsrcError(`Source response was too large at ${stage}`, {
          details: { stage },
        });
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function sourceUrl(value, path) {
  let url;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    url.pathname !== path ||
    url.hash
  ) {
    return null;
  }
  return url;
}

function validExpiry(value, maxAgeMs, now) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) &&
    seconds * 1_000 > now + 5_000 &&
    seconds * 1_000 < now + maxAgeMs;
}

export function parseVixsrcEmbed(apiBody, now = Date.now()) {
  let payload;
  try {
    payload = JSON.parse(apiBody);
  } catch {
    throw new VixsrcError("Source returned invalid episode data", {
      details: { stage: "api" },
    });
  }
  if (typeof payload?.src !== "string") {
    throw new VixsrcError("Source did not find this episode", {
      details: { stage: "api" },
    });
  }
  let path;
  try {
    path = new URL(payload.src, ORIGIN).pathname;
  } catch {
    path = "";
  }
  const embed = sourceUrl(payload.src, path);
  if (
    !embed ||
    !/^\/embed\/\d+$/.test(embed.pathname) ||
    !/^[a-f0-9]{16,128}$/i.test(embed.searchParams.get("token") ?? "") ||
    !validExpiry(embed.searchParams.get("expires"), MAX_EMBED_AGE_MS, now)
  ) {
    throw new VixsrcError("Source returned an invalid player URL", {
      details: { stage: "api" },
    });
  }
  return embed;
}

export function parseVixsrcPlaylists(html, embed, now = Date.now()) {
  const streamsText = String(html).match(
    /window\.streams\s*=\s*(\[[\s\S]{1,8192}?\]);/,
  )?.[1];
  const config = String(html).match(
    /window\.masterPlaylist\s*=\s*\{([\s\S]{1,2048}?)\}\s*(?:;|window\.)/,
  )?.[1];
  if (!streamsText || !config) {
    throw new VixsrcError("Source player contract changed", {
      retryable: true,
      details: { stage: "embed" },
    });
  }
  let streams;
  try {
    streams = JSON.parse(streamsText);
  } catch {
    throw new VixsrcError("Source returned invalid stream data", {
      details: { stage: "embed" },
    });
  }
  const token = /['"]token['"]\s*:\s*['"]([A-Za-z0-9_-]{16,256})['"]/.exec(config)?.[1];
  const expires = /['"]expires['"]\s*:\s*['"]?(\d{9,12})['"]?/.exec(config)?.[1];
  const asn = /['"]asn['"]\s*:\s*['"]([A-Za-z0-9_-]{0,64})['"]/.exec(config)?.[1];
  const root = /\burl\s*:\s*['"]([^'"]+)['"]/.exec(config)?.[1];
  const videoId = embed.pathname.split("/").at(-1);
  const path = `/playlist/${videoId}`;
  if (
    !token ||
    !validExpiry(expires, MAX_PLAYLIST_AGE_MS, now) ||
    !sourceUrl(root, path) ||
    !Array.isArray(streams)
  ) {
    throw new VixsrcError("Source returned an invalid playlist contract", {
      details: { stage: "embed" },
    });
  }
  const urls = [];
  for (const stream of [...streams].sort((a, b) => Number(b?.active) - Number(a?.active))) {
    const url = sourceUrl(stream?.url, path);
    if (!url || [...url.searchParams.keys()].some((key) => !["ub", "ab"].includes(key))) {
      continue;
    }
    url.searchParams.set("token", token);
    url.searchParams.set("expires", expires);
    if (asn) url.searchParams.set("asn", asn);
    if (embed.searchParams.get("canPlayFHD") === "1") {
      url.searchParams.set("h", "1");
    }
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  if (urls.length === 0) {
    throw new VixsrcError("Source offered no native playlists", {
      details: { stage: "embed" },
    });
  }
  return { urls: urls.slice(0, 3), expiresAt: Number(expires) * 1_000 };
}

export async function resolveVixsrc(media, options = {}) {
  assertMedia(media);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const startedAt = performance.now();
  const api = await fetchText(fetchImpl, apiUrl(media), options.signal, MAX_API_BYTES, "api");
  const embed = parseVixsrcEmbed(api);
  const html = await fetchText(fetchImpl, embed, options.signal, MAX_PAGE_BYTES, "embed");
  const playlists = parseVixsrcPlaylists(html, embed);
  const variants = [];
  for (const url of playlists.urls) {
    try {
      const manifest = await fetchText(
        fetchImpl,
        url,
        options.signal,
        MAX_MANIFEST_BYTES,
        "playlist",
      );
      if (!manifest.trimStart().startsWith("#EXTM3U")) continue;
      variants.push({
        url,
        type: "hls",
        expiresAt: playlists.expiresAt,
        audioLanguages: hlsAudioLanguages(manifest),
        deliveryMode: "native-direct",
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
    }
  }
  if (variants.length === 0) {
    throw new VixsrcError("Source offered no playable HLS stream", {
      retryable: true,
      details: { stage: "playlist" },
    });
  }
  return {
    variants,
    subtitles: [],
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

export function createVixsrcResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveVixsrc(media, options);
    return {
      candidates: normalizeVariants(result.variants, id),
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
