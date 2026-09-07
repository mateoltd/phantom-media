import { debugEvent } from "../debug.mjs";
import { failureDomainFor } from "../failure-domain.mjs";
import { normalizeVariants } from "./normalize.mjs";
import {
  assertVidfastMediaUrl,
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
const MAX_CODEC_STRATEGIES = 6;
const STRATEGY_HEDGE_MS = 300;
const RSC_DEADLINE_MS = 4_500;
const SERVER_DEADLINE_MS = 5_500;
const SUCCESS_GRACE_MS = 200;
const CACHE_TTL_MS = 2 * 60 * 1_000;
const CACHE = new Map();
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/138.0.0.0 Safari/537.36";
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
        retryable:
          response.status === 403 ||
          response.status === 404 ||
          response.status === 410 ||
          response.status === 429 ||
          response.status >= 500,
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
          "user-agent": BROWSER_USER_AGENT,
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
        "user-agent": BROWSER_USER_AGENT,
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
    "user-agent": BROWSER_USER_AGENT,
  };
}

function remoteCodecStrategy(origin, version) {
  const codecOrigin = trustedCodecOrigin(origin);
  const id = version
    ? `remote-v${version}:${codecOrigin}`
    : `remote-current:${codecOrigin}`;
  return Object.freeze({
    id,
    async bootstrap(fetchImpl, encryptedBootstrap, signal) {
      const url = new URL("/api/enc-vidfast", codecOrigin);
      url.searchParams.set("text", encryptedBootstrap);
      if (version) url.searchParams.set("version", version);
      return fetchJson(
        fetchImpl,
        url,
        {
          headers: {
            accept: "application/json",
            "user-agent": BROWSER_USER_AGENT,
          },
          signal,
        },
        MAX_CODEC_BYTES,
        "bootstrap decode",
      );
    },
    async decode(fetchImpl, cipher, signal, stage) {
      const body = { text: String(cipher).trim() };
      if (version) body.version = version;
      return fetchJson(
        fetchImpl,
        new URL("/api/dec-vidfast", codecOrigin),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": BROWSER_USER_AGENT,
          },
          body: JSON.stringify(body),
          signal,
        },
        MAX_CODEC_BYTES,
        stage,
      );
    },
  });
}

function trustedCodecOrigin(origin) {
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.protocol !== "https:" ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new TypeError("Vidfast codec origins must be trusted HTTPS origins");
  }
  return parsedOrigin.origin;
}

function codecStrategies(options) {
  if (Array.isArray(options.codecStrategies)) {
    return options.codecStrategies.filter(
      (strategy) =>
        strategy &&
        typeof strategy.id === "string" &&
        typeof strategy.bootstrap === "function" &&
        typeof strategy.decode === "function",
    );
  }
  const environmentOrigins = String(process.env.VIDFAST_CODEC_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const configured = Array.isArray(options.codecOrigins)
    ? options.codecOrigins
    : options.codecOrigin
      ? [options.codecOrigin]
      : [...environmentOrigins, DEFAULT_CODEC_ORIGIN];
  const origins = [...new Set(configured.map(trustedCodecOrigin))];
  return origins
    .flatMap((origin) => [
      remoteCodecStrategy(origin, null),
      remoteCodecStrategy(origin, "1"),
    ])
    .slice(0, MAX_CODEC_STRATEGIES);
}

async function decodeCipher(fetchImpl, codec, cipher, signal, stage) {
  if (!ENCRYPTED_VALUE.test(String(cipher).trim())) {
    throw new VidfastError(`Vidfast ${stage} returned invalid encrypted data`, {
      details: { stage },
    });
  }
  return codec.decode(fetchImpl, cipher, signal, stage);
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

function hedgeStrategy(signal, delayMs) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    signal.addEventListener("abort", aborted, { once: true });
    function done() {
      signal.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal.reason);
    }
  });
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
    context.codec,
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
  let upstream;
  try {
    upstream = assertVidfastMediaUrl(stream.url, context.mediaHosts);
  } catch (cause) {
    throw new VidfastError("Vidfast returned an unapproved media host", {
      cause,
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

async function resolveWithCodec(codec, context) {
  const bootstrap = await codec.bootstrap(
    context.fetchImpl,
    context.encryptedBootstrap,
    context.signal,
  );
  const result = bootstrap?.result;
  if (!result || bootstrap?.status !== 200) {
    throw new VidfastError("Vidfast bootstrap could not be decoded", {
      details: { stage: "bootstrap", strategy: codec.id },
    });
  }
  const serversEndpoint = endpointUrl(result.servers, context.origin, "servers");
  const streamsEndpoint = endpointUrl(result.stream, context.origin, "stream");
  const headers = requestHeaders(context.pageUrl, result.token);

  debugEvent("route", "vidfast.stage", { stage: "servers", strategy: codec.id });
  const serversCipher = await fetchText(
    context.fetchImpl,
    serversEndpoint,
    {
      method: "POST",
      headers,
      signal: context.signal,
    },
    MAX_UPSTREAM_BYTES,
    "servers",
  );
  const serverPayload = await decodeCipher(
    context.fetchImpl,
    codec,
    serversCipher,
    context.signal,
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
    codec,
    fetchImpl: context.fetchImpl,
    headers,
    mediaHosts: context.mediaHosts,
    origin: context.origin,
    proxyOrigin: context.proxyOrigin,
    signal: context.signal,
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
    context.proxyOrigin,
    context.mediaHosts,
  );
  debugEvent("route", "vidfast.resolved", {
    advertisedServers: servers.length,
    workingServers: fulfilled.length,
    uniqueStreams: variants.length,
    subtitles: subtitles.length,
    strategy: codec.id,
  });
  return {
    variants,
    subtitles,
  };
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

  const strategies = codecStrategies(options);
  if (strategies.length === 0) {
    throw new VidfastError("Vidfast has no configured codec strategy", {
      details: { stage: "codec" },
    });
  }
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const attempts = new Array(strategies.length);
  const tasks = strategies.map(async (codec, index) => {
    try {
      await hedgeStrategy(signal, index * STRATEGY_HEDGE_MS);
      return await resolveWithCodec(codec, {
        encryptedBootstrap,
        fetchImpl,
        mediaHosts,
        origin,
        pageUrl,
        proxyOrigin: options.proxyOrigin,
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (!controller.signal.aborted) {
        attempts[index] = {
          strategy: codec.id,
          stage: error?.details?.stage ?? "unknown",
          status: error?.status ?? null,
          retryable: Boolean(error?.retryable),
          message: String(error?.message ?? "Vidfast codec failed").slice(0, 180),
        };
        debugEvent("route", "vidfast.strategy-failed", attempts[index]);
      }
      throw error;
    }
  });
  try {
    const result = await Promise.any(tasks);
    controller.abort();
    return {
      ...result,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    controller.abort();
    if (options.signal?.aborted) {
      throw error?.errors?.[0] ?? error;
    }
  }
  const failures = attempts.filter(Boolean);
  throw new VidfastError("Vidfast codec strategies were exhausted", {
    retryable: failures.some(
      (attempt) =>
        attempt.retryable ||
        attempt.status === 403 ||
        attempt.status === 404 ||
        attempt.status === 410 ||
        attempt.status === 429 ||
        attempt.status >= 500,
    ),
    details: { stage: "codec-strategies", attempts: failures },
  });
}

function cacheKey(media, proxyOrigin, options) {
  const codecs = codecStrategies(options).map((strategy) => strategy.id);
  return JSON.stringify([
    media.type,
    Number(media.tmdbId),
    media.type === "tv" ? Number(media.season) : null,
    media.type === "tv" ? Number(media.episode) : null,
    new URL(proxyOrigin).origin,
    codecs,
  ]);
}

export async function resolveVidfast(media, options = {}) {
  assertMedia(media);
  if (!options.proxyOrigin) {
    throw new TypeError("A Vidfast proxy origin is required");
  }
  const key = cacheKey(media, options.proxyOrigin, options);
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
