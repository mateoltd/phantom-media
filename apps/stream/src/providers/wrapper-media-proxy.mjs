import { Buffer } from "node:buffer";

export const WRAPPER_MEDIA_PROXY_PATH = "/api/sources/relay-media";

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
  const base = new URL(proxyOrigin);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError("Relay media origin must be HTTP or HTTPS");
  }
  const url = new URL(WRAPPER_MEDIA_PROXY_PATH, base);
  url.searchParams.set(
    "target",
    Buffer.from(target.href, "utf8").toString("base64url"),
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

function upstreamHeaders(request, target) {
  const hostname = target.hostname.toLowerCase();
  const videasy =
    hostname === VIDEASY_BREACH_HOST ||
    hostname === VIDEASY_YORU_HOST ||
    VIDEASY_YORU_SITE.test(hostname);
  const headers = new Headers({
    accept:
      request.headers.get("accept") ??
      "application/vnd.apple.mpegurl,video/mp2t,*/*",
    origin: videasy ? "https://player.videasy.to" : "https://cinemaos.tech",
    referer: videasy
      ? "https://player.videasy.to/"
      : "https://cinemaos.tech/",
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
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

function cachedManifest(target) {
  const entry = MANIFEST_CACHE.get(target.href);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    MANIFEST_CACHE.delete(target.href);
    return null;
  }
  return entry;
}

function storeManifest(target, upstream, body) {
  MANIFEST_CACHE.set(target.href, {
    body,
    expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
    headers: [...upstream.headers],
    status: upstream.status,
  });
}

export async function primeWrapperMediaTarget(input, options = {}) {
  const target = assertWrapperMediaUrl(input);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cached = cachedManifest(target);
  if (cached) return cached.body;
  const request = new Request("http://localhost", {
    headers: {
      accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    },
  });
  const upstream = await fetchImpl(target, {
    method: "GET",
    headers: upstreamHeaders(request, target),
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
  storeManifest(target, upstream, body);
  return body;
}

function wrapperChildTarget(value, upstream) {
  const absolute = new URL(value, upstream);
  try {
    return assertWrapperMediaUrl(absolute);
  } catch {
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

function proxiedUri(value, upstream, proxyOrigin) {
  return encodeWrapperMediaTarget(
    wrapperChildTarget(value, upstream),
    proxyOrigin,
  );
}

export function rewriteWrapperHls(manifest, upstream, proxyOrigin) {
  const source = assertWrapperMediaUrl(upstream);
  return String(manifest)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith("#")) {
        return proxiedUri(trimmed, source, proxyOrigin);
      }
      return line.replace(/\bURI=(["'])(.*?)\1/g, (_match, quote, value) => {
        return `URI=${quote}${proxiedUri(
          value,
          source,
          proxyOrigin,
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
  try {
    const encoded = new URL(request.url).searchParams.get("target");
    target = decodeWrapperMediaTarget(encoded);
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cached =
    request.method === "GET" && !request.headers.has("range")
      ? cachedManifest(target)
      : null;
  if (cached) {
    let body = cached.body;
    try {
      body = rewriteWrapperHls(body, target, new URL(request.url).origin);
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
    upstream = await fetchImpl(target, {
      method: request.method,
      headers: upstreamHeaders(request, target),
      redirect: "manual",
      signal: request.signal,
    });
  } catch {
    return new Response("Relay media request failed", { status: 502 });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel();
    return new Response("Relay media redirect was refused", { status: 502 });
  }

  const manifest = request.method === "GET" && isManifest(target, upstream);
  if (!manifest) {
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  }

  let body;
  try {
    body = await limitedText(upstream);
  } catch (error) {
    upstream.body?.cancel();
    return new Response(error.message, { status: 502 });
  }

  if (upstream.ok) {
    storeManifest(target, upstream, body);
    try {
      body = rewriteWrapperHls(
        body,
        target,
        new URL(request.url).origin,
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
