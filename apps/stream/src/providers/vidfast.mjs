import { debugEvent } from "../debug.mjs";
import { failureDomainFor } from "../failure-domain.mjs";
import { normalizeVariants } from "./normalize.mjs";
import {
  decodeVidfastProxyTarget,
  encodeVidfastProxyTarget,
  primeVidfastMediaTarget,
  vidfastMediaHosts,
} from "./vidfast-proxy.mjs";

export const VIDFAST_FAILURE_DOMAIN = failureDomainFor("u9");

const DEFAULT_ORIGIN = "https://vidfast.vc";
const DEFAULT_CODEC_ORIGIN = "https://enc-dec.app";
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_CODEC_BYTES = 2 * 1024 * 1024;
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
const MAX_SERVERS = 12;
const MAX_TRACKS = 100;
const RSC_DEADLINE_MS = 4_500;
const SERVER_DEADLINE_MS = 5_500;
const SUCCESS_GRACE_MS = 200;
const CACHE_TTL_MS = 2 * 60 * 1_000;
const CACHE = new Map();
const ENCRYPTED_VALUE = /^[A-Za-z0-9_+/=-]{16,262144}$/;
const SERVER_DATA = /^[A-Za-z0-9_-]{1,8192}$/;

const LANGUAGE_CODES = Object.freeze({
  arabic: "ar",
  czech: "cs",
  dutch: "nl",
  english: "en",
  french: "fr",
  greek: "el",
  hungarian: "hu",
  polish: "pl",
  portuguese: "pt",
  protuguese: "pt",
  spanish: "es",
  turkish: "tr",
});

export class VidfastError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VidfastError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = null;
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

function mediaPath(media) {
  if (media.type === "movie") return `/movie/${Number(media.tmdbId)}`;
  return `/tv/${Number(media.tmdbId)}/${Number(media.season)}/${Number(media.episode)}`;
}

async function limitedText(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new VidfastError("Vidfast response exceeded the size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function fetchText(fetchImpl, input, options, limit, stage) {
  let response;
  try {
    response = await fetchImpl(input, {
      ...options,
      redirect: "manual",
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new VidfastError(`Vidfast ${stage} request failed`, {
      cause: error,
      retryable: true,
      details: { stage },
    });
  }
  if (!response.ok) {
    response.body?.cancel();
    throw new VidfastError(
      `Vidfast ${stage} returned HTTP ${response.status}`,
      {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
        details: { stage },
      },
    );
  }
  return limitedText(response, limit);
}

async function fetchJson(fetchImpl, input, options, limit, stage) {
  const text = await fetchText(fetchImpl, input, options, limit, stage);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new VidfastError(`Vidfast ${stage} returned invalid JSON`, {
      cause: error,
      details: { stage },
    });
  }
}

export function extractVidfastBootstrap(html) {
  const escaped = String(html).match(/\\"en\\":\\"([^"\\]+)\\"/)?.[1];
  const plain = String(html).match(/"en":"([^"\\]+)"/)?.[1];
  const value = escaped ?? plain ?? null;
  return value && ENCRYPTED_VALUE.test(value) ? value : null;
}

async function fetchBootstrap(fetchImpl, pageUrl, signal) {
  const rscUrl = new URL(pageUrl);
  rscUrl.searchParams.set("_rsc", "phantom");
  const rscTimeout = AbortSignal.timeout(RSC_DEADLINE_MS);
  const rscSignal = signal
    ? AbortSignal.any([signal, rscTimeout])
    : rscTimeout;

  try {
    debugEvent("route", "vidfast.stage", { stage: "bootstrap-rsc" });
    const payload = await fetchText(
      fetchImpl,
      rscUrl,
      {
        headers: {
          accept: "text/x-component",
          rsc: "1",
        },
        signal: rscSignal,
      },
      MAX_PAGE_BYTES,
      "RSC bootstrap",
    );
    const bootstrap = extractVidfastBootstrap(payload);
    if (bootstrap) return bootstrap;
  } catch (error) {
    if (signal?.aborted) throw error;
    debugEvent("route", "vidfast.rsc-fallback", {
      message: error?.message ?? "RSC bootstrap was unavailable",
    });
  }

  debugEvent("route", "vidfast.stage", { stage: "bootstrap-html" });
  const page = await fetchText(
    fetchImpl,
    pageUrl,
    {
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
      signal,
    },
    MAX_PAGE_BYTES,
    "page",
  );
  return extractVidfastBootstrap(page);
}

function endpointUrl(input, origin, stage) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new VidfastError(`Vidfast ${stage} endpoint was invalid`, {
      details: { stage },
    });
  }
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname === "/"
  ) {
    throw new VidfastError(`Vidfast ${stage} endpoint was not allowed`, {
      details: { stage },
    });
  }
  return url;
}

function requestHeaders(pageUrl, token) {
  return {
    accept: "text/plain,*/*",
    origin: pageUrl.origin,
    referer: pageUrl.href,
    "x-csrf-token": String(token ?? "").slice(0, 8192),
    "x-requested-with": "XMLHttpRequest",
  };
}

async function decodeCipher(fetchImpl, codecOrigin, cipher, signal, stage) {
  if (!ENCRYPTED_VALUE.test(String(cipher).trim())) {
    throw new VidfastError(`Vidfast ${stage} returned invalid encrypted data`, {
      details: { stage },
    });
  }
  return fetchJson(
    fetchImpl,
    new URL("/api/dec-vidfast", codecOrigin),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: String(cipher).trim(), version: "1" }),
      signal,
    },
    MAX_CODEC_BYTES,
    stage,
  );
}

function streamEndpoint(base, data, origin) {
  if (!SERVER_DATA.test(data)) {
    throw new VidfastError("Vidfast returned invalid server data", {
      details: { stage: "stream" },
    });
  }
  return endpointUrl(
    `${base.href.replace(/\/$/, "")}/${data}`,
    origin,
    "stream",
  );
}

function trackLanguage(label) {
  const raw = String(label ?? "").trim().toLowerCase();
  if (/^zh(?:[-_]|$)/.test(raw)) return "zh";
  const name = raw.replace(/\s*\([^)]*\)\s*/g, " ").trim().split(/\s+/)[0];
  return LANGUAGE_CODES[name] ?? "und";
}

function localProxyPath(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeTracks(tracks, proxyOrigin, mediaHosts) {
  const seen = new Set();
  const normalized = [];
  for (const track of Array.isArray(tracks) ? tracks.slice(0, MAX_TRACKS) : []) {
    if (typeof track?.file !== "string" || seen.has(track.file)) continue;
    try {
      const file = localProxyPath(
        encodeVidfastProxyTarget(track.file, proxyOrigin, mediaHosts),
      );
      seen.add(track.file);
      const label = String(track.label ?? "Unknown").slice(0, 120);
      normalized.push({
        id: `vidfast-caption-${normalized.length}`,
        display: label,
        label,
        file,
        lang: trackLanguage(label),
        origin: "source",
      });
    } catch {
    }
  }
  return normalized;
}

async function resolveServer(server, context) {
  if (!server || typeof server.data !== "string") {
    throw new VidfastError("Vidfast returned an invalid server entry", {
      details: { stage: "stream" },
    });
  }
  const endpoint = streamEndpoint(
    context.streamEndpoint,
    server.data,
    context.origin,
  );
  const cipher = await fetchText(
    context.fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: context.headers,
      signal: context.signal,
    },
    MAX_UPSTREAM_BYTES,
    "stream",
  );
  const decoded = await decodeCipher(
    context.fetchImpl,
    context.codecOrigin,
    cipher,
    context.signal,
    "stream decode",
  );
  const stream = decoded?.result;
  if (!stream || typeof stream.url !== "string") {
    throw new VidfastError("Vidfast returned an invalid stream", {
      details: { stage: "stream" },
    });
  }
  const upstream = new URL(stream.url);
  if (!context.mediaHosts.has(upstream.hostname.toLowerCase())) {
    throw new VidfastError("Vidfast returned an unapproved media host", {
      details: { stage: "media" },
    });
  }
  return {
    variant: {
      url: encodeVidfastProxyTarget(
        upstream,
        context.proxyOrigin,
        context.mediaHosts,
      ),
      type: "hls",
      resolution: null,
      failureDomain: VIDFAST_FAILURE_DOMAIN,
      capacityDomains: [VIDFAST_FAILURE_DOMAIN],
      delivery: "full-relay",
      audioLanguages: [],
    },
    tracks: stream.tracks,
  };
}

async function firstWorkingServers(servers, context) {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(SERVER_DEADLINE_MS);
  const signal = context.signal
    ? AbortSignal.any([context.signal, timeout, controller.signal])
    : AbortSignal.any([timeout, controller.signal]);
  const tasks = servers.map((server) => {
    const startedAt = performance.now();
    return resolveServer(server, { ...context, signal }).then(
      (value) => ({
        ok: true,
        value,
        resolvedInMs: performance.now() - startedAt,
      }),
      (error) => ({ ok: false, error }),
    );
  });

  let first;
  try {
    first = await Promise.any(
      tasks.map((task) =>
        task.then((entry) => {
          if (!entry.ok) throw entry.error;
          return entry.value;
        }),
      ),
    );
  } catch {
    const settled = await Promise.all(tasks);
    const failure = settled.find((entry) => !entry.ok);
    throw failure?.error ?? new VidfastError("Vidfast returned no playable stream");
  }

  await Promise.race([
    Promise.all(tasks),
    new Promise((resolve) => setTimeout(resolve, SUCCESS_GRACE_MS)),
  ]);
  controller.abort();
  const settled = await Promise.all(tasks);
  const fulfilled = settled
    .filter((entry) => entry.ok)
    .sort((left, right) => left.resolvedInMs - right.resolvedInMs)
    .map((entry) => entry.value);
  return fulfilled.length > 0 ? fulfilled : [first];
}

async function resolveVidfastUncached(media, options = {}) {
  assertMedia(media);
  if (!options.proxyOrigin) {
    throw new TypeError("A Vidfast proxy origin is required");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const origin = new URL(options.origin ?? DEFAULT_ORIGIN).origin;
  const codecOrigin = new URL(
    options.codecOrigin ?? DEFAULT_CODEC_ORIGIN,
  ).origin;
  const mediaHosts =
    options.mediaHosts ?? vidfastMediaHosts(options.extraMediaHosts);
  const pageUrl = new URL(mediaPath(media), origin);
  const startedAt = performance.now();

  const encryptedBootstrap = await fetchBootstrap(
    fetchImpl,
    pageUrl,
    options.signal,
  );
  if (!encryptedBootstrap) {
    throw new VidfastError("Vidfast page contained no stream bootstrap", {
      details: { stage: "bootstrap" },
    });
  }
  const bootstrapUrl = new URL("/api/enc-vidfast", codecOrigin);
  bootstrapUrl.searchParams.set("text", encryptedBootstrap);
  bootstrapUrl.searchParams.set("version", "1");
  const bootstrap = await fetchJson(
    fetchImpl,
    bootstrapUrl,
    {
      headers: { accept: "application/json" },
      signal: options.signal,
    },
    MAX_CODEC_BYTES,
    "bootstrap decode",
  );
  const result = bootstrap?.result;
  if (!result || bootstrap?.status !== 200) {
    throw new VidfastError("Vidfast bootstrap could not be decoded", {
      details: { stage: "bootstrap" },
    });
  }
  const serversEndpoint = endpointUrl(result.servers, origin, "servers");
  const streamsEndpoint = endpointUrl(result.stream, origin, "stream");
  const headers = requestHeaders(pageUrl, result.token);

  debugEvent("route", "vidfast.stage", { stage: "servers" });
  const serversCipher = await fetchText(
    fetchImpl,
    serversEndpoint,
    {
      method: "POST",
      headers,
      signal: options.signal,
    },
    MAX_UPSTREAM_BYTES,
    "servers",
  );
  const serverPayload = await decodeCipher(
    fetchImpl,
    codecOrigin,
    serversCipher,
    options.signal,
    "servers decode",
  );
  const servers = Array.isArray(serverPayload?.result)
    ? serverPayload.result.slice(0, MAX_SERVERS)
    : [];
  if (servers.length === 0) {
    throw new VidfastError("Vidfast returned no servers", {
      details: { stage: "servers" },
    });
  }

  const fulfilled = await firstWorkingServers(servers, {
    codecOrigin,
    fetchImpl,
    headers,
    mediaHosts,
    origin,
    proxyOrigin: options.proxyOrigin,
    signal: options.signal,
    streamEndpoint: streamsEndpoint,
  });

  const variants = [];
  const seen = new Set();
  for (const entry of fulfilled) {
    if (seen.has(entry.variant.url)) continue;
    seen.add(entry.variant.url);
    variants.push(entry.variant);
  }
  const subtitles = normalizeTracks(
    fulfilled.flatMap((entry) => entry.tracks ?? []),
    options.proxyOrigin,
    mediaHosts,
  );
  debugEvent("route", "vidfast.resolved", {
    advertisedServers: servers.length,
    workingServers: fulfilled.length,
    uniqueStreams: variants.length,
    subtitles: subtitles.length,
  });
  return {
    variants,
    subtitles,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function cacheKey(media, proxyOrigin) {
  return JSON.stringify([
    media.type,
    Number(media.tmdbId),
    media.type === "tv" ? Number(media.season) : null,
    media.type === "tv" ? Number(media.episode) : null,
    new URL(proxyOrigin).origin,
  ]);
}

export async function resolveVidfast(media, options = {}) {
  assertMedia(media);
  if (!options.proxyOrigin) {
    throw new TypeError("A Vidfast proxy origin is required");
  }
  const key = cacheKey(media, options.proxyOrigin);
  const cached = CACHE.get(key);
  if (!options.fresh && cached?.expiresAt > Date.now()) {
    debugEvent("route", "vidfast.cache-hit", {
      expiresInMs: cached.expiresAt - Date.now(),
      variants: cached.value.variants.length,
    });
    return { ...cached.value, latencyMs: 0 };
  }
  if (cached) CACHE.delete(key);

  const result = await resolveVidfastUncached(media, options);
  CACHE.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: result,
  });
  return result;
}

export function createVidfastResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveVidfast(media, options);
    const normalized = normalizeVariants(result.variants, id);
    const preferred = normalized[0];
    if (preferred && !options.fetchImpl) {
      const timeout = AbortSignal.timeout(4_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      try {
        const upstream = decodeVidfastProxyTarget(
          new URL(preferred.url).searchParams.get("target"),
        );
        await primeVidfastMediaTarget(upstream, { signal });
      } catch {
        // Probing can retry if this optional warm-up misses its budget.
      }
    }
    return {
      candidates: normalized,
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
