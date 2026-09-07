import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export const WRAPPER_MEDIA_PROXY_PATH = "/api/sources/relay-media";

export class ProxyCapabilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProxyCapabilityError";
    this.status = 503;
    this.retryable = true;
    this.retryAfterMs = 60_000;
    this.details = { stage: "media-capability" };
  }
}

const ALLOWED_PATHS = Object.freeze({
  "raindrop.cinemaos.workers.dev": Object.freeze([
    "/m3u8-proxy",
    "/m/",
    "/t/",
  ]),
  "proxy.cinemaos.live": Object.freeze([
    "/cors-m3u8-proxy",
    "/cors-ts-proxy",
  ]),
  "play.cinemaos.in": Object.freeze(["/api/hlsproxy"]),
  "play.cinemaos.workers.dev": Object.freeze(["/proxy"]),
});

const VIDEASY_BREACH_HOST = "peraspera.waltersamson74809.workers.dev";
const VIDEASY_WORKER_VALUE = /^[A-Za-z0-9_.-]{8,4096}$/;
const VIDEASY_YORU_HOST = "moon.ironwallnet.net";
const VIDEASY_YORU_SITE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.site$/;
const VIDEASY_YORU_PATH =
  /^\/vd\/[A-Za-z0-9_-]{32,}(?:\/[A-Za-z0-9._~-]{1,256})+$/;
const VIDEASY_DISCOVERED_HOST =
  /^moon\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VIDEASY_ROTATED_CHILD_HOST =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:site|top)$/;
const VIDEASY_ROTATED_CHILD_PATH =
  /^(?:\/r2\/cdn[12]\/[A-Za-z0-9_-]{64,}(?:\/[A-Za-z0-9._~-]{1,256}){1,8}|\/vd\/[A-Za-z0-9_-]{64,}\/(?:init|seg-[1-9]\d*)-s\d{3,4}p-v[1-9]\d*-a[1-9]\d*\.(?:mp4|m4s))$/;
const VIDEASY_DISCOVERED_PATH =
  /^\/(?:[A-Za-z0-9._~-]{1,128}\/){0,6}[A-Za-z0-9_-]{32,}(?:\/[A-Za-z0-9._~-]{1,256}){1,8}$/;
const CINESRC_CAPABILITY_SOURCE = "cinesrc";
const CINESRC_ORIGIN = "https://cinesrc.st";
const PUBLIC_DNS_HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const RESERVED_DISCOVERY_SUFFIXES = Object.freeze([
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
]);

const CAPABILITY_VERSION = "v1";
const DEVELOPMENT_CAPABILITY_SECRET =
  "phantom-stream-local-development-capability-secret";
const CAPABILITY_TTL_MS = 12 * 60 * 60 * 1_000;
const CAPABILITY_CLOCK_SKEW_MS = 30_000;
const CAPABILITY_MAX_TTL_MS = 24 * 60 * 60 * 1_000;

const DIRECT_CHILD_WRAPPERS = Object.freeze({
  "play.cinemaos.in": Object.freeze({
    path: "/api/hlsproxy",
    preservedParams: Object.freeze(["ref", "org"]),
  }),
  "play.cinemaos.workers.dev": Object.freeze({
    path: "/proxy",
    preservedParams: Object.freeze(["referer"]),
  }),
});

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MANIFEST_CACHE_TTL_MS = 45_000;
const MANIFEST_CACHE = new Map();

function allowedPath(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === VIDEASY_BREACH_HOST) {
    const keys = [...url.searchParams.keys()];
    return (
      url.pathname === "/" &&
      keys.every((key) => ["payload", "headers", "type"].includes(key)) &&
      new Set(keys).size === keys.length &&
      VIDEASY_WORKER_VALUE.test(url.searchParams.get("payload") ?? "") &&
      VIDEASY_WORKER_VALUE.test(url.searchParams.get("headers") ?? "") &&
      (!url.searchParams.has("type") ||
        url.searchParams.get("type") === "m3u8")
    );
  }
  if (
    (hostname === VIDEASY_YORU_HOST || VIDEASY_YORU_SITE.test(hostname)) &&
    !url.search &&
    VIDEASY_YORU_PATH.test(url.pathname)
  ) {
    return true;
  }
  const prefixes = ALLOWED_PATHS[hostname];
  return Boolean(prefixes?.some((prefix) => url.pathname.startsWith(prefix)));
}

function assertDiscoveredVideasyUrl(input, allowRotatedChild) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("Discovered media target is not a valid URL");
  }
  const hostname = url.hostname.toLowerCase();
  const discoveredRoot = VIDEASY_DISCOVERED_HOST.test(hostname);
  const rotatedChild =
    VIDEASY_ROTATED_CHILD_HOST.test(hostname) &&
    VIDEASY_ROTATED_CHILD_PATH.test(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    hostname === VIDEASY_YORU_HOST ||
    VIDEASY_YORU_SITE.test(hostname) ||
    (!discoveredRoot && !(allowRotatedChild && rotatedChild)) ||
    RESERVED_DISCOVERY_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    !VIDEASY_DISCOVERED_PATH.test(url.pathname)
  ) {
    throw new TypeError("Discovered media target is not allowed");
  }
  url.hash = "";
  return url;
}

export function assertDiscoveredVideasyMediaUrl(input) {
  return assertDiscoveredVideasyUrl(input, false);
}

export function assertDiscoveredVideasyRelayUrl(input) {
  return assertDiscoveredVideasyUrl(input, true);
}

export function assertDiscoveredCineSrcMediaUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("Discovered CineSrc media target is not a valid URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !PUBLIC_DNS_HOST.test(hostname) ||
    RESERVED_DISCOVERY_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    url.pathname === "/" ||
    url.pathname.length > 2_048 ||
    url.search.length > 4_096
  ) {
    throw new TypeError("Discovered CineSrc media target is not allowed");
  }
  url.hash = "";
  return url;
}

function capabilitySecret(value) {
  const configured = value ?? process.env.SOURCE_PROXY_SECRET;
  const secret = String(
    configured ||
      (process.env.NODE_ENV === "production"
        ? ""
        : DEVELOPMENT_CAPABILITY_SECRET),
  );
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new ProxyCapabilityError(
      "SOURCE_PROXY_SECRET must contain at least 32 bytes",
    );
  }
  return secret;
}

function capabilitySignature(target, expires, secret) {
  return createHmac("sha256", capabilitySecret(secret))
    .update(`${CAPABILITY_VERSION}\n${expires}\n${target.href}`)
    .digest("base64url");
}

function cinesrcCapabilitySignature(target, expires, secret) {
  return createHmac("sha256", capabilitySecret(secret))
    .update(
      `${CAPABILITY_VERSION}\n${CINESRC_CAPABILITY_SOURCE}\n${expires}\n${target.href}`,
    )
    .digest("base64url");
}

function safeSignatureEqual(left, right) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(left ?? ""))) return false;
  const expected = Buffer.from(right, "utf8");
  const received = Buffer.from(String(left), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function encodeTarget(target, proxyOrigin) {
  const base = new URL(proxyOrigin);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError("Relay media origin must be HTTP or HTTPS");
  }
  const url = new URL(WRAPPER_MEDIA_PROXY_PATH, base);
  url.searchParams.set(
    "target",
    Buffer.from(target.href, "utf8").toString("base64url"),
  );
  return url;
}

export function assertWrapperMediaUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("Relay media target is not a valid URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowedPath(url)
  ) {
    throw new TypeError("Relay media target is not allowed");
  }
  url.hash = "";
  return url;
}

export function encodeWrapperMediaTarget(upstream, proxyOrigin) {
  const target = assertWrapperMediaUrl(upstream);
  return encodeTarget(target, proxyOrigin).href;
}

export function encodeDiscoveredVideasyMediaTarget(
  upstream,
  proxyOrigin,
  options = {},
) {
  const target = assertDiscoveredVideasyUrl(
    upstream,
    options.allowRotatedChild === true,
  );
  const now = Number(options.now ?? Date.now());
  const expires = Math.trunc(now + (options.ttlMs ?? CAPABILITY_TTL_MS));
  const url = encodeTarget(target, proxyOrigin);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    capabilitySignature(target, expires, options.secret),
  );
  return url.href;
}

export function encodeDiscoveredCineSrcMediaTarget(
  upstream,
  proxyOrigin,
  options = {},
) {
  const target = assertDiscoveredCineSrcMediaUrl(upstream);
  const now = Number(options.now ?? Date.now());
  const expires = Math.trunc(now + (options.ttlMs ?? CAPABILITY_TTL_MS));
  const url = encodeTarget(target, proxyOrigin);
  url.searchParams.set("source", CINESRC_CAPABILITY_SOURCE);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    cinesrcCapabilitySignature(target, expires, options.secret),
  );
  return url.href;
}

export function decodeWrapperMediaTarget(encoded) {
  if (!/^[A-Za-z0-9_-]{24,16000}$/.test(String(encoded ?? ""))) {
    throw new TypeError("Relay media target is invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    throw new TypeError("Relay media target is invalid");
  }
  return assertWrapperMediaUrl(decoded);
}

export function decodeDiscoveredVideasyMediaTarget(
  encoded,
  expiresValue,
  signature,
  options = {},
) {
  if (!/^[A-Za-z0-9_-]{24,16000}$/.test(String(encoded ?? ""))) {
    throw new TypeError("Discovered media capability is invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    throw new TypeError("Discovered media capability is invalid");
  }
  const target = assertDiscoveredVideasyUrl(decoded, true);
  const expires = Number(expiresValue);
  const now = Number(options.now ?? Date.now());
  if (
    !Number.isSafeInteger(expires) ||
    expires < now - CAPABILITY_CLOCK_SKEW_MS ||
    expires > now + CAPABILITY_MAX_TTL_MS
  ) {
    throw new TypeError("Discovered media capability expired");
  }
  const expected = capabilitySignature(target, expires, options.secret);
  if (!safeSignatureEqual(signature, expected)) {
    throw new TypeError("Discovered media capability signature is invalid");
  }
  return target;
}

export function decodeDiscoveredCineSrcMediaTarget(
  encoded,
  expiresValue,
  signature,
  options = {},
) {
  if (!/^[A-Za-z0-9_-]{24,16000}$/.test(String(encoded ?? ""))) {
    throw new TypeError("Discovered CineSrc media capability is invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    throw new TypeError("Discovered CineSrc media capability is invalid");
  }
  const target = assertDiscoveredCineSrcMediaUrl(decoded);
  const expires = Number(expiresValue);
  const now = Number(options.now ?? Date.now());
  if (
    !Number.isSafeInteger(expires) ||
    expires < now - CAPABILITY_CLOCK_SKEW_MS ||
    expires > now + CAPABILITY_MAX_TTL_MS
  ) {
    throw new TypeError("Discovered CineSrc media capability expired");
  }
  const expected = cinesrcCapabilitySignature(target, expires, options.secret);
  if (!safeSignatureEqual(signature, expected)) {
    throw new TypeError("Discovered CineSrc media capability signature is invalid");
  }
  return target;
}

export function proxyWrapperCandidate(candidate, proxyOrigin) {
  try {
    return {
      ...candidate,
      url: encodeWrapperMediaTarget(candidate.url, proxyOrigin),
      deliveryMode: "resolver-full-relay",
    };
  } catch {
    return candidate;
  }
}

export function proxyDiscoveredVideasyCandidate(
  candidate,
  proxyOrigin,
  options = {},
) {
  return {
    ...candidate,
    url: encodeDiscoveredVideasyMediaTarget(
      candidate.url,
      proxyOrigin,
      options,
    ),
    deliveryMode: "resolver-full-relay",
  };
}

export function proxyDiscoveredCineSrcCandidate(
  candidate,
  proxyOrigin,
  options = {},
) {
  return {
    ...candidate,
    url: encodeDiscoveredCineSrcMediaTarget(
      candidate.url,
      proxyOrigin,
      options,
    ),
    deliveryMode: "resolver-full-relay",
  };
}

function upstreamHeaders(request, target, source = null) {
  const hostname = target.hostname.toLowerCase();
  const videasy =
    hostname === VIDEASY_BREACH_HOST ||
    hostname === VIDEASY_YORU_HOST ||
    VIDEASY_YORU_SITE.test(hostname) ||
    VIDEASY_DISCOVERED_HOST.test(hostname) ||
    VIDEASY_ROTATED_CHILD_HOST.test(hostname);
  const headers = new Headers({
    accept:
      request.headers.get("accept") ??
      "application/vnd.apple.mpegurl,video/mp2t,*/*",
    origin:
      source === CINESRC_CAPABILITY_SOURCE
        ? CINESRC_ORIGIN
        : videasy
          ? "https://player.videasy.to"
          : "https://cinemaos.tech",
    referer:
      source === CINESRC_CAPABILITY_SOURCE
        ? `${CINESRC_ORIGIN}/`
        : videasy
          ? "https://player.videasy.to/"
          : "https://cinemaos.tech/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/138.0.0.0 Safari/537.36",
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function videasyTarget(target) {
  const hostname = target.hostname.toLowerCase();
  return (
    hostname === VIDEASY_BREACH_HOST ||
    hostname === VIDEASY_YORU_HOST ||
    VIDEASY_YORU_SITE.test(hostname) ||
    VIDEASY_DISCOVERED_HOST.test(hostname) ||
    VIDEASY_ROTATED_CHILD_HOST.test(hostname)
  );
}

function configuredVideasyRelayUrl(value) {
  const configured = String(value ?? process.env.VIDEASY_RELAY_URL ?? "").trim();
  if (!configured) return null;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new ProxyCapabilityError("VIDEASY_RELAY_URL is invalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new ProxyCapabilityError("VIDEASY_RELAY_URL is not allowed");
  }
  return url;
}

function videasyRelaySecret(value) {
  const secret = String(
    value ?? process.env.VIDEASY_RESOLVER_SECRET ?? "",
  );
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new ProxyCapabilityError(
      "VIDEASY_RESOLVER_SECRET must contain at least 32 bytes",
    );
  }
  return secret;
}

async function fetchVideasyViaRelay(target, requestOptions, options = {}) {
  const relayUrl = configuredVideasyRelayUrl(options.relayUrl);
  if (!relayUrl) return null;
  const headers = new Headers({
    accept: requestOptions.headers.get("accept") ?? "*/*",
    authorization: `Bearer ${videasyRelaySecret(options.relaySecret)}`,
    "x-phantom-target": Buffer.from(target.href, "utf8").toString("base64url"),
    "x-phantom-upstream-method": requestOptions.method ?? "GET",
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = requestOptions.headers.get(name);
    if (value) headers.set(`x-phantom-${name}`, value);
  }
  const fetchImpl = options.relayFetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(relayUrl, {
    method: "POST",
    headers,
    redirect: "manual",
    signal: requestOptions.signal,
  });
  if (response.status >= 300 && response.status < 400) {
    response.body?.cancel();
    throw new TypeError("Videasy relay redirect was refused");
  }
  return response;
}

function nodeHttpsFetch(target, options) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      target,
      {
        family: 4,
        headers: Object.fromEntries(new Headers(options.headers)),
        method: options.method ?? "GET",
      },
      (upstream) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(upstream.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) headers.append(name, entry);
          } else if (value != null) {
            headers.set(name, value);
          }
        }
        const body = options.method === "HEAD" ? null : Readable.toWeb(upstream);
        upstream.once("close", cleanup);
        resolve(
          new Response(body, {
            headers,
            status: upstream.statusCode ?? 502,
          }),
        );
      },
    );
    const aborted = () => {
      request.destroy(options.signal?.reason ?? new Error("Request aborted"));
    };
    const cleanup = () => {
      options.signal?.removeEventListener("abort", aborted);
    };
    request.once("error", (error) => {
      cleanup();
      reject(error);
    });
    if (options.signal?.aborted) {
      aborted();
      return;
    }
    options.signal?.addEventListener("abort", aborted, { once: true });
    request.end();
  });
}

function responseHeaders(upstream, manifest = false) {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-expose-headers":
      "accept-ranges,content-length,content-range,content-type",
    "cache-control": "private, no-store",
    "cross-origin-resource-policy": "cross-origin",
    vary: "range",
  });
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (manifest) {
    headers.set("content-type", "application/vnd.apple.mpegurl; charset=utf-8");
    headers.delete("content-length");
    headers.delete("content-range");
  }
  return headers;
}

function isManifest(url, response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    url.pathname.includes("m3u8") ||
    url.pathname.startsWith("/m/") ||
    contentType.includes("mpegurl") ||
    contentType.includes("m3u")
  );
}

async function inspectUpstreamBody(upstream, target, request, source) {
  if (request.method !== "GET" || !upstream.body) {
    return { body: request.method === "HEAD" ? null : upstream.body, manifest: null };
  }
  if (isManifest(target, upstream)) {
    return { body: null, manifest: await limitedText(upstream) };
  }
  if (source !== CINESRC_CAPABILITY_SOURCE) {
    return { body: upstream.body, manifest: null };
  }

  const [inspection, delivery] = upstream.body.tee();
  const reader = inspection.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let prefix = "";
  let size = 0;
  try {
    while (prefix.trimStart().length < 7 && size <= 1_024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      prefix += decoder.decode(value, { stream: true });
      const trimmed = prefix.trimStart();
      if (trimmed && !"#EXTM3U".startsWith(trimmed)) break;
    }
    if (!prefix.trimStart().startsWith("#EXTM3U")) {
      void reader.cancel();
      return { body: delivery, manifest: null };
    }
    void delivery.cancel();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      if (size > MAX_MANIFEST_BYTES) {
        throw new RangeError("Relay manifest exceeded the size limit");
      }
    }
    const textDecoder = new TextDecoder();
    let manifest = "";
    for (const chunk of chunks) {
      manifest += textDecoder.decode(chunk, { stream: true });
    }
    manifest += textDecoder.decode();
    return { body: null, manifest };
  } finally {
    reader.releaseLock();
  }
}

async function limitedText(response) {
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
      if (size > MAX_MANIFEST_BYTES) {
        throw new RangeError("Relay manifest exceeded the size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function manifestCacheKey(target, source = null) {
  return `${source ?? "wrapper"}\n${target.href}`;
}

function cachedManifest(target, source = null) {
  const key = manifestCacheKey(target, source);
  const entry = MANIFEST_CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    MANIFEST_CACHE.delete(key);
    return null;
  }
  return entry;
}

function storeManifest(target, upstream, body, source = null) {
  MANIFEST_CACHE.set(manifestCacheKey(target, source), {
    body,
    expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
    headers: [...upstream.headers],
    status: upstream.status,
  });
}

export async function primeWrapperMediaTarget(input, options = {}) {
  const target = assertWrapperMediaUrl(input);
  return primeMediaTarget(target, options, null);
}

export async function primeDiscoveredVideasyMediaTarget(input, options = {}) {
  const target = assertDiscoveredVideasyMediaUrl(input);
  return primeMediaTarget(target, options, "videasy");
}

export async function primeDiscoveredCineSrcMediaTarget(input, options = {}) {
  const target = assertDiscoveredCineSrcMediaUrl(input);
  return primeMediaTarget(target, options, CINESRC_CAPABILITY_SOURCE);
}

async function primeMediaTarget(target, options = {}, source = null) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cached = cachedManifest(target, source);
  if (cached) return cached.body;
  const request = new Request("http://localhost", {
    headers: {
      accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    },
  });
  const upstream = await fetchImpl(target, {
    method: "GET",
    headers: upstreamHeaders(request, target, source),
    redirect: "manual",
    signal: options.signal,
  });
  if (!upstream.ok || !isManifest(target, upstream)) {
    upstream.body?.cancel();
    throw new TypeError("Relay media target did not return an HLS manifest");
  }
  const body = await limitedText(upstream);
  if (!body.trimStart().startsWith("#EXTM3U")) {
    throw new TypeError("Relay media target returned invalid HLS");
  }
  storeManifest(target, upstream, body, source);
  return body;
}

function wrapperChildTarget(value, upstream, source = null) {
  const absolute = new URL(value, upstream);
  if (source === CINESRC_CAPABILITY_SOURCE) {
    const child = assertDiscoveredCineSrcMediaUrl(absolute);
    if (child.origin !== upstream.origin) {
      throw new TypeError("CineSrc manifest child changed media origin");
    }
    return child;
  }
  try {
    return assertWrapperMediaUrl(absolute);
  } catch {
    if (
      VIDEASY_DISCOVERED_HOST.test(upstream.hostname.toLowerCase()) ||
      VIDEASY_ROTATED_CHILD_HOST.test(upstream.hostname.toLowerCase())
    ) {
      return assertDiscoveredVideasyUrl(absolute, true);
    }
    const wrapper = DIRECT_CHILD_WRAPPERS[upstream.hostname.toLowerCase()];
    if (!wrapper || upstream.pathname !== wrapper.path) {
      throw new TypeError("Relay manifest child is not allowed");
    }
    const wrapped = new URL(wrapper.path, upstream);
    wrapped.searchParams.set("url", absolute.href);
    for (const key of wrapper.preservedParams) {
      const header = upstream.searchParams.get(key);
      if (header) wrapped.searchParams.set(key, header);
    }
    return assertWrapperMediaUrl(wrapped);
  }
}

function proxiedUri(value, upstream, proxyOrigin, options) {
  const target = wrapperChildTarget(value, upstream, options.source);
  if (options.source === CINESRC_CAPABILITY_SOURCE) {
    return encodeDiscoveredCineSrcMediaTarget(target, proxyOrigin, options);
  }
  try {
    return encodeWrapperMediaTarget(target, proxyOrigin);
  } catch {
    return encodeDiscoveredVideasyMediaTarget(target, proxyOrigin, {
      ...options,
      allowRotatedChild: true,
    });
  }
}

export function rewriteWrapperHls(manifest, upstream, proxyOrigin, options = {}) {
  let source;
  if (options.source === CINESRC_CAPABILITY_SOURCE) {
    source = assertDiscoveredCineSrcMediaUrl(upstream);
  } else {
    try {
      source = assertWrapperMediaUrl(upstream);
    } catch {
      source = assertDiscoveredVideasyUrl(upstream, true);
    }
  }
  return String(manifest)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith("#")) {
        return proxiedUri(trimmed, source, proxyOrigin, options);
      }
      return line.replace(/\bURI=(["'])(.*?)\1/g, (_match, quote, value) => {
        return `URI=${quote}${proxiedUri(
          value,
          source,
          proxyOrigin,
          options,
        )}${quote}`;
      });
    })
    .join("\n");
}

export async function proxyWrapperMediaRequest(request, options = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  let target;
  let discovered = false;
  let source = null;
  try {
    const params = new URL(request.url).searchParams;
    const encoded = params.get("target");
    if (params.get("source") === CINESRC_CAPABILITY_SOURCE) {
      target = decodeDiscoveredCineSrcMediaTarget(
        encoded,
        params.get("expires"),
        params.get("signature"),
        options,
      );
      discovered = true;
      source = CINESRC_CAPABILITY_SOURCE;
    } else {
      try {
        target = decodeWrapperMediaTarget(encoded);
      } catch {
        target = decodeDiscoveredVideasyMediaTarget(
          encoded,
          params.get("expires"),
          params.get("signature"),
          options,
        );
        discovered = true;
        source = "videasy";
      }
    }
  } catch (error) {
    return new Response(error.message, {
      status: error instanceof ProxyCapabilityError ? 503 : 400,
    });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cached =
    request.method === "GET" && !request.headers.has("range")
      ? cachedManifest(target, source)
      : null;
  if (cached) {
    let body = cached.body;
    try {
      body = rewriteWrapperHls(body, target, new URL(request.url).origin, {
        ...options,
        source,
      });
    } catch {
      return new Response("Relay manifest contained an unsafe URI", {
        status: 502,
      });
    }
    return new Response(body, {
      status: cached.status,
      headers: responseHeaders(
        new Response(null, { headers: cached.headers }),
        true,
      ),
    });
  }
  let upstream;
  try {
    const requestOptions = {
      method: request.method,
      headers: upstreamHeaders(request, target, source),
      redirect: "manual",
      signal: request.signal,
    };
    const relayed = videasyTarget(target)
      ? await fetchVideasyViaRelay(target, requestOptions, options)
      : null;
    upstream = relayed ??
      (discovered && !options.fetchImpl && process.env.NODE_ENV !== "production"
        ? await nodeHttpsFetch(target, requestOptions)
        : await fetchImpl(target, requestOptions));
  } catch {
    return new Response("Relay media request failed", { status: 502 });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel();
    return new Response("Relay media redirect was refused", { status: 502 });
  }

  let inspected;
  try {
    inspected = await inspectUpstreamBody(upstream, target, request, source);
  } catch (error) {
    upstream.body?.cancel();
    return new Response(error.message, { status: 502 });
  }
  if (inspected.manifest === null) {
    return new Response(inspected.body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  }

  let body = inspected.manifest;

  if (upstream.ok) {
    storeManifest(target, upstream, body, source);
    try {
      body = rewriteWrapperHls(
        body,
        target,
        new URL(request.url).origin,
        discovered ? { ...options, source } : {},
      );
    } catch {
      return new Response("Relay manifest contained an unsafe URI", {
        status: 502,
      });
    }
  }
  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders(upstream, true),
  });
}
