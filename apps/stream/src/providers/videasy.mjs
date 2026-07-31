import {
  failureDomainFor,
  fingerprintFailureLayer,
} from "../failure-domain.mjs";
import { normalizeVariants } from "./normalize.mjs";
import {
  primeWrapperMediaTarget,
  proxyWrapperCandidate,
} from "./wrapper-media-proxy.mjs";

const DEFAULT_API_ORIGIN = "https://api.speedracelight.com";
const DEFAULT_PLAYER_ORIGIN = "https://player.videasy.to";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 2 * 60 * 1_000;
const CACHE = new Map();

const API_HEADERS = Object.freeze({
  accept: "application/json, text/plain, */*",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
});

const SEED = /^[A-Za-z0-9_.-]{8,256}$/;
const CIPHER = /^[A-Za-z0-9_.-]{8,2097152}$/;
const WORKER_VALUE = /^[A-Za-z0-9_.-]{8,4096}$/;
const YORU_PATH =
  /^\/vd\/[A-Za-z0-9_-]{32,}(?:\/[A-Za-z0-9._~-]{1,256})*\/(?:master|index[^/]*)\.m3u8$/;
const ROTATING_SITE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.site$/;
const BREACH_HOST = "peraspera.waltersamson74809.workers.dev";
const YORU_HOST = "moon.ironwallnet.net";

const ROUND_CONSTANTS = Object.freeze([
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993,
  2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987,
  1925078388, 2162078206, 2614888103, 3248222580,
]);
const MAGIC = Uint8Array.from([109, 118, 109, 49]);

const BREACH_DOMAIN = fingerprintFailureLayer(
  "videasy:breach:peraspera-worker",
);
const YORU_DOMAIN = failureDomainFor("u9");

export class VideasyError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VideasyError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.details = options.details ?? null;
  }
}

function assertMedia(media) {
  if (!["movie", "tv"].includes(media?.type)) {
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

function rotateLeft(value, amount) {
  const word = value >>> 0;
  const shift = amount & 31;
  return shift === 0
    ? word
    : ((word << shift) | (word >>> (32 - shift))) >>> 0;
}

function mix(value) {
  let word = value >>> 0;
  word ^= word >>> 16;
  word = Math.imul(word, 2246822507) >>> 0;
  word ^= word >>> 13;
  word = Math.imul(word, 3266489909) >>> 0;
  return (word ^ (word >>> 16)) >>> 0;
}

function seedHash(seed) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value = Math.imul(value ^ seed.charCodeAt(index), 16777619) >>> 0;
  }
  return mix(value);
}

function cipherState(seed, mediaId) {
  const oddTriangular = ((seed.length * (seed.length + 1)) & 1) === 1;
  if (oddTriangular) {
    const schedule = Array.from({ length: 256 }, (_, index) => index);
    let swapIndex = 0;
    for (let index = 0; index < 256; index += 1) {
      swapIndex =
        (swapIndex +
          schedule[index] +
          seed.charCodeAt(index % seed.length)) &
        255;
      [schedule[index], schedule[swapIndex]] = [
        schedule[swapIndex],
        schedule[index],
      ];
    }
    let accumulator = 1732584193;
    for (let index = 0; index < seed.length; index += 1) {
      accumulator = rotateLeft(
        (accumulator ^
          Math.imul(
            seed.charCodeAt(index),
            ROUND_CONSTANTS[index & 15],
          )) >>>
          0,
        5,
      );
    }
    return { schedule, accumulator: mix(accumulator) };
  }

  const schedule = Array(61);
  let accumulator =
    mix(seedHash(seed) ^ mix((Number(mediaId) >>> 0) ^ 2654435769)) >>> 0;
  for (let index = 0; index < 8; index += 1) {
    if (((index * (index + 1)) & 1) === 0) {
      const position = accumulator % 61;
      accumulator = rotateLeft(
        (accumulator + 2654435769) >>> 0,
        7 + (index & 7),
      );
      schedule[position] = (accumulator ^ mix(accumulator)) >>> 0;
      accumulator = mix((accumulator + position) >>> 0);
    } else {
      schedule[index] = ROUND_CONSTANTS[index & 15];
    }
  }
  return {
    schedule,
    accumulator: mix((2779096485 ^ accumulator) >>> 0),
  };
}

function nextWord(state, counter) {
  const position = state.accumulator % 61;
  const presentMask = 0 - Number(position in state.schedule);
  const lane = state.schedule[position] >>> 0;
  const salted =
    (lane ^ Math.imul(2654435769, counter + 1)) >>> 0;
  let value =
    ((state.accumulator ^ salted) >>> 0 |
      (state.accumulator & salted & presentMask) >>> 0) >>>
    0;
  value =
    (rotateLeft((value + state.accumulator) >>> 0, position) ^
      rotateLeft(state.accumulator, Math.imul(position, 7))) >>>
    0;
  const next = mix((value + 2654435769) >>> 0);
  state.schedule[position] = next;
  state.accumulator = next;
  return next;
}

function decodeBase64Url(value) {
  return Uint8Array.from(
    Buffer.from(
      value.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ),
  );
}

export function decodeVideasyPayload(cipher, seed, mediaId) {
  const encoded = String(cipher ?? "").trim();
  if (!CIPHER.test(encoded) || !SEED.test(String(seed ?? ""))) {
    throw new VideasyError("Videasy returned invalid encrypted data", {
      details: { stage: "decode" },
    });
  }
  const encrypted = decodeBase64Url(encoded);
  const state = cipherState(String(seed), Number(mediaId));
  const decoded = new Uint8Array(encrypted.length);
  let offset = 0;
  let counter = 0;
  while (offset < decoded.length) {
    const word = nextWord(state, counter);
    counter += 1;
    decoded[offset] = word & 255;
    offset += 1;
    if (offset < decoded.length) decoded[offset++] = (word >>> 8) & 255;
    if (offset < decoded.length) decoded[offset++] = (word >>> 16) & 255;
    if (offset < decoded.length) decoded[offset++] = (word >>> 24) & 255;
  }
  for (let index = 0; index < decoded.length; index += 1) {
    decoded[index] ^= encrypted[index];
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (decoded[index] !== MAGIC[index]) {
      throw new VideasyError("Videasy payload authentication failed", {
        details: { stage: "decode" },
      });
    }
  }
  return new TextDecoder().decode(decoded.subarray(MAGIC.length));
}

async function limitedText(response, limit = MAX_RESPONSE_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new VideasyError("Videasy response exceeded the size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function retryAfter(response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

async function fetchText(fetchImpl, url, options, stage) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: "error" });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new VideasyError(`Videasy ${stage} request failed`, {
      cause: error,
      retryable: true,
      details: { stage },
    });
  }
  if (!response.ok) {
    response.body?.cancel();
    throw new VideasyError(
      `Videasy ${stage} returned HTTP ${response.status}`,
      {
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
        retryAfterMs: retryAfter(response),
        details: { stage },
      },
    );
  }
  return limitedText(response);
}

function apiHeaders(playerOrigin) {
  return {
    ...API_HEADERS,
    origin: playerOrigin,
    referer: `${playerOrigin}/`,
  };
}

async function fetchSeed(fetchImpl, apiOrigin, playerOrigin, mediaId, signal) {
  const url = new URL("/seed", apiOrigin);
  url.searchParams.set("mediaId", String(mediaId));
  const text = await fetchText(
    fetchImpl,
    url,
    { headers: apiHeaders(playerOrigin), signal },
    "seed",
  );
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new VideasyError("Videasy seed returned invalid JSON", {
      cause: error,
      details: { stage: "seed" },
    });
  }
  if (!SEED.test(String(payload?.seed ?? ""))) {
    throw new VideasyError("Videasy seed was invalid", {
      details: { stage: "seed" },
    });
  }
  return payload.seed;
}

function sourceQuery(media, seed) {
  const query = new URLSearchParams({
    title: encodeURIComponent(String(media.title ?? "").slice(0, 300)),
    mediaType: media.type,
    year: String(media.year ?? "").slice(0, 4),
    tmdbId: String(Number(media.tmdbId)),
    enc: "2",
    seed,
  });
  if (media.imdbId) query.set("imdbId", String(media.imdbId).slice(0, 20));
  if (media.type === "tv") {
    query.set("seasonId", String(Number(media.season)));
    query.set("episodeId", String(Number(media.episode)));
  }
  return query;
}

async function fetchFamily(
  family,
  media,
  seed,
  context,
) {
  const path =
    family === "breach"
      ? "/m4uhd/sources-with-title"
      : "/cdn/sources-with-title";
  const url = new URL(path, context.apiOrigin);
  url.search = sourceQuery(media, seed).toString();
  const cipher = await fetchText(
    context.fetchImpl,
    url,
    {
      headers: apiHeaders(context.playerOrigin),
      signal: context.signal,
    },
    family,
  );
  let payload;
  try {
    payload = JSON.parse(
      context.decodeImpl(cipher, seed, Number(media.tmdbId)),
    );
  } catch (error) {
    if (error instanceof VideasyError) throw error;
    throw new VideasyError(`Videasy ${family} returned invalid data`, {
      cause: error,
      details: { stage: family },
    });
  }
  return payload;
}

function validYoruUrl(input) {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      (hostname === YORU_HOST || ROTATING_SITE.test(hostname)) &&
      YORU_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function validBreachUrl(input) {
  try {
    const url = new URL(input);
    const keys = [...url.searchParams.keys()];
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === BREACH_HOST &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      keys.every((key) => ["payload", "headers", "type"].includes(key)) &&
      new Set(keys).size === keys.length &&
      WORKER_VALUE.test(url.searchParams.get("payload") ?? "") &&
      WORKER_VALUE.test(url.searchParams.get("headers") ?? "") &&
      (!url.searchParams.has("type") ||
        url.searchParams.get("type") === "m3u8")
    );
  } catch {
    return false;
  }
}

function normalizeSubtitles(payloads) {
  const seen = new Set();
  const tracks = [];
  for (const payload of payloads) {
    for (const entry of Array.isArray(payload?.subtitles)
      ? payload.subtitles.slice(0, 100)
      : []) {
      const raw = entry?.url ?? entry?.file;
      let url;
      try {
        url = new URL(raw);
      } catch {
        continue;
      }
      if (
        url.protocol !== "https:" ||
        (url.hostname !== "strem.io" && !url.hostname.endsWith(".strem.io")) ||
        seen.has(url.href)
      ) {
        continue;
      }
      seen.add(url.href);
      tracks.push({
        id: `videasy-caption-${tracks.length}`,
        display: String(entry.label ?? entry.language ?? "Unknown").slice(0, 120),
        label: String(entry.label ?? entry.language ?? "Unknown").slice(0, 120),
        file: url.href,
        lang: String(entry.lang ?? entry.language ?? "und").slice(0, 35),
        origin: "source",
      });
    }
  }
  return tracks;
}

function variantsFrom(breach, yoru) {
  const variants = [];
  for (const source of Array.isArray(breach?.sources)
    ? breach.sources.slice(0, 20)
    : []) {
    if (!validBreachUrl(source?.url)) continue;
    variants.push({
      url: source.url,
      type: "hls",
      quality: source.quality,
      failureDomain: BREACH_DOMAIN,
      capacityDomains: [BREACH_DOMAIN],
      deliveryMode: "native-direct",
      audioLanguages: [],
    });
  }

  const yoruSources =
    typeof yoru?.playlist === "string"
      ? [{ url: yoru.playlist, quality: "adaptive" }]
      : Array.isArray(yoru?.sources)
        ? yoru.sources.slice(0, 20)
        : [];
  for (const source of yoruSources) {
    if (!validYoruUrl(source?.url)) continue;
    variants.push({
      url: source.url,
      type: "hls",
      quality: source.quality,
      failureDomain: YORU_DOMAIN,
      capacityDomains: [YORU_DOMAIN],
      deliveryMode: "native-direct",
      audioLanguages: [],
    });
  }
  return variants;
}

async function resolveVideasyUncached(media, options = {}) {
  assertMedia(media);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const apiOrigin = new URL(options.apiOrigin ?? DEFAULT_API_ORIGIN).origin;
  const playerOrigin = new URL(
    options.playerOrigin ?? DEFAULT_PLAYER_ORIGIN,
  ).origin;
  const decodeImpl = options.decodeImpl ?? decodeVideasyPayload;
  const startedAt = performance.now();
  const seed = await fetchSeed(
    fetchImpl,
    apiOrigin,
    playerOrigin,
    Number(media.tmdbId),
    options.signal,
  );
  const context = {
    apiOrigin,
    decodeImpl,
    fetchImpl,
    playerOrigin,
    signal: options.signal,
  };
  const [breachResult, yoruResult] = await Promise.allSettled([
    fetchFamily("breach", media, seed, context),
    fetchFamily("yoru", media, seed, context),
  ]);
  const breach =
    breachResult.status === "fulfilled" ? breachResult.value : null;
  const yoru = yoruResult.status === "fulfilled" ? yoruResult.value : null;
  const variants = variantsFrom(breach, yoru);
  if (variants.length === 0) {
    const failure =
      breachResult.status === "rejected"
        ? breachResult.reason
        : yoruResult.status === "rejected"
          ? yoruResult.reason
          : null;
    if (failure) throw failure;
  }
  return {
    variants,
    subtitles: normalizeSubtitles([breach, yoru]),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function cacheKey(media) {
  return JSON.stringify([
    media.type,
    Number(media.tmdbId),
    media.type === "tv" ? Number(media.season) : null,
    media.type === "tv" ? Number(media.episode) : null,
  ]);
}

export async function resolveVideasy(media, options = {}) {
  assertMedia(media);
  const key = cacheKey(media);
  const cached = CACHE.get(key);
  if (!options.fresh && cached?.expiresAt > Date.now()) {
    return { ...cached.value, latencyMs: 0 };
  }
  if (cached) CACHE.delete(key);
  const result = await resolveVideasyUncached(media, options);
  if (result.variants.length > 0) {
    CACHE.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: result,
    });
  }
  return result;
}

export function createVideasyResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveVideasy(media, options);
    const normalized = normalizeVariants(result.variants, id);
    const breach = normalized.find(
      (candidate) => candidate.failureDomain === BREACH_DOMAIN,
    );
    if (breach && options.proxyOrigin && !options.fetchImpl) {
      const timeout = AbortSignal.timeout(4_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      try {
        await primeWrapperMediaTarget(breach.url, { signal });
      } catch {
        // The constrained relay can still retry during probing.
      }
    }
    const candidates = normalized.map(
      (candidate) =>
        candidate.failureDomain === BREACH_DOMAIN && options.proxyOrigin
          ? proxyWrapperCandidate(candidate, options.proxyOrigin)
          : candidate,
    );
    return {
      candidates,
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
