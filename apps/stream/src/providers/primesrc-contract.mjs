import { normalizeAudioLanguage } from "../media-language.mjs";

export const PRIMESRC_ORIGIN = "https://primesrc.me";

const SERVER_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const NATIVE_MEDIA_PATH = /\.(?:m3u8|mpd|mp4)(?:$|[?#])/i;
const MAX_SERVERS = 500;

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return String(number);
}

function assertMedia(media) {
  if (media?.type !== "movie" && media?.type !== "tv") {
    throw new TypeError('media.type must be "movie" or "tv"');
  }
  if (
    typeof media.imdbId !== "string" ||
    !/^tt\d{5,12}$/i.test(media.imdbId)
  ) {
    positiveInteger(media.tmdbId, "media.tmdbId");
  }
  if (media.type === "tv") {
    positiveInteger(media.season, "media.season");
    positiveInteger(media.episode, "media.episode");
  }
}

export function primeSrcInventoryUrl(media) {
  assertMedia(media);
  const url = new URL("/api/v1/s", PRIMESRC_ORIGIN);
  url.searchParams.set("type", media.type);
  if (
    typeof media.imdbId === "string" &&
    /^tt\d{5,12}$/i.test(media.imdbId)
  ) {
    url.searchParams.set("imdb", media.imdbId.toLowerCase());
  } else {
    url.searchParams.set("tmdb", positiveInteger(media.tmdbId, "media.tmdbId"));
  }
  if (media.type === "tv") {
    url.searchParams.set(
      "season",
      positiveInteger(media.season, "media.season"),
    );
    url.searchParams.set(
      "episode",
      positiveInteger(media.episode, "media.episode"),
    );
  }
  return url;
}

export function primeSrcLinkExchangeUrl(key) {
  const normalized = String(key ?? "").trim();
  if (!SERVER_KEY.test(normalized)) {
    throw new TypeError("PrimeSrc server key is invalid");
  }
  const url = new URL("/api/v1/l", PRIMESRC_ORIGIN);
  url.searchParams.set("key", normalized);
  return url;
}

function boundedText(value, limit) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, limit) : null;
}

export function parsePrimeSrcInventory(payload) {
  let document = payload;
  if (typeof payload === "string") {
    try {
      document = JSON.parse(payload);
    } catch (cause) {
      throw new TypeError("PrimeSrc inventory was not valid JSON", { cause });
    }
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("PrimeSrc inventory must be an object");
  }
  if (!Array.isArray(document.servers)) {
    throw new TypeError("PrimeSrc inventory has no server array");
  }
  if (document.servers.length > MAX_SERVERS) {
    throw new TypeError("PrimeSrc inventory contains too many servers");
  }

  const seen = new Set();
  const servers = [];
  for (const value of document.servers) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const key = String(value.key ?? "").trim();
    const name = boundedText(value.name, 80);
    if (!name || !SERVER_KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    servers.push(
      Object.freeze({
        key,
        name,
        audioLanguage: normalizeAudioLanguage(value.audio_language),
        audioType: boundedText(value.audio_type, 32),
        fileName: boundedText(value.file_name, 512),
        fileSize: boundedText(value.file_size, 64),
        quality: boundedText(value.quality, 32),
      }),
    );
  }

  return Object.freeze({
    info:
      document.info && typeof document.info === "object"
        ? Object.freeze({
            type:
              document.info.type === "movie" || document.info.type === "tv"
                ? document.info.type
                : null,
            title: boundedText(document.info.title, 512),
            imdbId: boundedText(document.info.imdb_id, 32),
          })
        : null,
    servers: Object.freeze(servers),
  });
}

export function classifyPrimeSrcLinkResponse(response) {
  const status = Number(response?.status);
  const headers = response?.headers;
  const mitigation = headers?.get?.("cf-mitigated")?.toLowerCase();
  if (status === 403 && mitigation === "challenge") {
    return "challenge-required";
  }
  const contentType = headers?.get?.("content-type")?.toLowerCase() ?? "";
  if (status >= 200 && status < 300 && contentType.includes("application/json")) {
    return "json";
  }
  return "invalid";
}

export function classifyPrimeSrcResolvedLink(payload) {
  let document = payload;
  if (typeof payload === "string") {
    try {
      document = JSON.parse(payload);
    } catch {
      return Object.freeze({ classification: "invalid", url: null });
    }
  }
  if (!document || typeof document.link !== "string") {
    return Object.freeze({ classification: "invalid", url: null });
  }
  let url;
  try {
    url = new URL(document.link);
  } catch {
    return Object.freeze({ classification: "invalid", url: null });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  ) {
    return Object.freeze({ classification: "invalid", url: null });
  }
  return Object.freeze({
    classification: NATIVE_MEDIA_PATH.test(url.href) ? "native" : "external",
    url: url.href,
  });
}
