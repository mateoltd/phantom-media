import { Buffer } from "node:buffer";
import { debugEvent } from "../debug.mjs";
import { normalizeVariants, numericResolution } from "./normalize.mjs";
import {
  encodeVidsrcProxyTarget,
  vidsrcMediaHosts,
} from "./vidsrc-proxy.mjs";

export const VIDSRC_FAILURE_DOMAIN =
  "vidsrc:vsembed:cloudorchestranova:verdantvagary";

const DEFAULT_EMBED_ORIGINS = Object.freeze([
  "https://vsembed.su",
  "https://vsembed.ru",
]);
const DEFAULT_ORCHESTRATION_HOSTS = Object.freeze([
  "cloudorchestranova.com",
]);
const MAX_OUTER_BYTES = 256 * 1024;
const MAX_PLAYER_BYTES = 1024 * 1024;
const TOKEN = /^[A-Za-z0-9._~-]{20,4096}$/;

function configuredList(name, fallback) {
  const configured = String(process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : fallback;
}

export class VidsrcError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VidsrcError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
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
  if (media.type === "movie") {
    return `/embed/movie/${Number(media.tmdbId)}?autoplay=0`;
  }
  const params = new URLSearchParams({
    tmdb: String(Number(media.tmdbId)),
    season: String(Number(media.season)),
    episode: String(Number(media.episode)),
    autoplay: "0",
    autonext: "0",
  });
  return `/embed/tv?${params}`;
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
      if (size > limit) throw new VidsrcError("VidSrc response was too large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function fetchText(fetchImpl, url, options, limit) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        ...options?.headers,
      },
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new VidsrcError("VidSrc request failed", {
      cause: error,
      retryable: true,
    });
  }
  if (!response.ok) {
    response.body?.cancel();
    throw new VidsrcError(`VidSrc returned HTTP ${response.status}`, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return limitedText(response, limit);
}

function htmlValue(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
}

export function extractVidsrcIframe(html) {
  for (const match of String(html).matchAll(/<iframe\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bid\s*=\s*(["'])player_iframe\1/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (src) return htmlValue(src);
  }
  return null;
}

export function extractVidsrcPlayerPath(html) {
  const scripted = String(html).match(
    /\bsrc\s*:\s*(["'])([^"']*\/prorcp\/[^"']+)\1/i,
  )?.[2];
  return scripted ? htmlValue(scripted) : extractVidsrcIframe(html);
}

export function extractVidsrcMasterTemplates(html) {
  const value = String(html).match(
    /\bmaster_urls\s*=\s*(["'])(.*?)\1\s*;/is,
  )?.[2];
  if (!value) return [];
  return [...new Set(value.split(/\s+or\s+/i).map(htmlValue).filter(Boolean))];
}

export function extractVidsrcTokenEndpoint(html, master) {
  const explicit = String(html).match(
    /(?:\$\.get|fetch)\(\s*(["'])(https:\/\/[^"']+\/generate\.php)\1/i,
  )?.[2];
  return explicit ? htmlValue(explicit) : new URL("/generate.php", master).href;
}

function allowedUrl(input, hosts, label) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.has(url.hostname.toLowerCase())
  ) {
    throw new VidsrcError(`VidSrc ${label} host is not allowed`, {
      details: {
        stage: label,
        observedHost: url.hostname.toLowerCase(),
      },
    });
  }
  return url;
}

function replaceToken(template, token, mediaHosts) {
  if (!template.includes("__TOKEN__")) {
    throw new VidsrcError("VidSrc master template had no token placeholder");
  }
  const url = allowedUrl(template, mediaHosts, "media");
  url.href = url.href.replaceAll("__TOKEN__", encodeURIComponent(token));
  return url;
}

function tokenExpiry(token) {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return Number.isSafeInteger(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function masterResolution(template) {
  return numericResolution(template.match(/(?:quality|res)[=_/-](\d{3,4})/i)?.[1]);
}

async function resolveAtOrigin(media, origin, options) {
  const fetchImpl = options.fetchImpl;
  const signal = options.signal;
  const orchestrationHosts = new Set(options.orchestrationHosts);
  const mediaHosts = options.mediaHosts;
  const outerUrl = new URL(mediaPath(media), origin);
  debugEvent("route", "vidsrc.stage", {
    stage: "embed",
    host: outerUrl.hostname,
  });
  const outer = await fetchText(
    fetchImpl,
    outerUrl,
    { signal },
    MAX_OUTER_BYTES,
  );

  const iframe = extractVidsrcIframe(outer);
  if (!iframe) throw new VidsrcError("VidSrc embed contained no player frame");
  const rcpUrl = allowedUrl(
    new URL(iframe, outerUrl),
    orchestrationHosts,
    "orchestration",
  );
  debugEvent("route", "vidsrc.stage", {
    stage: "orchestration",
    host: rcpUrl.hostname,
  });
  const rcp = await fetchText(
    fetchImpl,
    rcpUrl,
    { headers: { referer: outerUrl.href }, signal },
    MAX_OUTER_BYTES,
  );

  const playerPath = extractVidsrcPlayerPath(rcp);
  if (!playerPath) {
    throw new VidsrcError("VidSrc orchestration contained no player path");
  }
  const playerUrl = allowedUrl(
    new URL(playerPath, rcpUrl),
    orchestrationHosts,
    "player",
  );
  debugEvent("route", "vidsrc.stage", {
    stage: "player",
    host: playerUrl.hostname,
  });
  const player = await fetchText(
    fetchImpl,
    playerUrl,
    { headers: { referer: rcpUrl.href }, signal },
    MAX_PLAYER_BYTES,
  );

  const templates = extractVidsrcMasterTemplates(player);
  if (templates.length === 0) {
    throw new VidsrcError("VidSrc player contained no HLS master");
  }
  const discoveredMediaHosts = [
    ...new Set(
      templates.flatMap((template) => {
        try {
          return [new URL(template).hostname.toLowerCase()];
        } catch {
          return [];
        }
      }),
    ),
  ];
  debugEvent("route", "vidsrc.templates", {
    count: templates.length,
    mediaHosts: discoveredMediaHosts,
  });

  const firstMaster = allowedUrl(templates[0], mediaHosts, "media");
  const tokenEndpoint = allowedUrl(
    extractVidsrcTokenEndpoint(player, firstMaster),
    mediaHosts,
    "token",
  );
  if (tokenEndpoint.pathname !== "/generate.php") {
    throw new VidsrcError("VidSrc token endpoint path is not allowed");
  }
  const token = (
    await fetchText(
      fetchImpl,
      tokenEndpoint,
      {
        headers: {
          origin: playerUrl.origin,
          referer: playerUrl.href,
        },
        signal,
      },
      8 * 1024,
    )
  ).trim();
  if (!TOKEN.test(token)) {
    throw new VidsrcError("VidSrc returned an invalid media token");
  }

  const expiresAt = tokenExpiry(token);
  const variants = templates.map((template) => {
    const upstream = replaceToken(template, token, mediaHosts);
    return {
      url: encodeVidsrcProxyTarget(
        upstream,
        options.proxyOrigin,
        mediaHosts,
      ),
      type: "hls",
      resolution: masterResolution(template),
      failureDomain: VIDSRC_FAILURE_DOMAIN,
      delivery: "full-relay",
      expiresAt,
    };
  });
  debugEvent("route", "vidsrc.resolved", {
    variants: variants.length,
    mediaHosts: discoveredMediaHosts,
    expiresInMs: expiresAt ? Math.max(0, expiresAt - Date.now()) : null,
  });
  return { variants, subtitles: [], playerUrl: playerUrl.href, expiresAt };
}

export async function resolveVidsrc(media, options = {}) {
  assertMedia(media);
  if (!options.proxyOrigin) {
    throw new TypeError("A VidSrc proxy origin is required");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const embedOrigins =
    options.embedOrigins ??
    configuredList("VIDSRC_EMBED_ORIGINS", DEFAULT_EMBED_ORIGINS);
  const orchestrationHosts =
    options.orchestrationHosts ??
    configuredList(
      "VIDSRC_ORCHESTRATION_HOSTS",
      DEFAULT_ORCHESTRATION_HOSTS,
    );
  const mediaHosts =
    options.mediaHosts ?? vidsrcMediaHosts(options.extraMediaHosts);
  const startedAt = performance.now();
  let lastError;

  for (const origin of embedOrigins) {
    try {
      const result = await resolveAtOrigin(media, origin, {
        ...options,
        embedOrigins,
        fetchImpl,
        mediaHosts,
        orchestrationHosts,
      });
      return {
        ...result,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      lastError = error;
      debugEvent("route", "vidsrc.origin-failed", {
        embedHost: new URL(origin).hostname,
        message: error?.message,
        retryable: Boolean(error?.retryable),
        details: error?.details ?? null,
      });
      if (options.signal?.aborted) throw error;
    }
  }
  throw lastError ?? new VidsrcError("VidSrc could not be resolved");
}

export function createVidsrcResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveVidsrc(media, options);
    return {
      candidates: normalizeVariants(result.variants, id),
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
    };
  };
}
