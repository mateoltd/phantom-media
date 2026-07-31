import { normalizeVariants, sourceType } from "./normalize.mjs";
import { parseStremioManifestUrl } from "../source-ids.mjs";

const MANIFEST_LIMIT = 128 * 1024;
const STREAM_LIMIT = 512 * 1024;
const MAX_STREAMS = 250;
const MAX_SUBTITLES = 250;

export class StremioError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "StremioError";
  }
}

function streamType(media) {
  return media.type === "tv" ? "series" : "movie";
}

function contentId(media) {
  if (!/^tt\d{5,12}$/i.test(media.imdbId ?? "")) {
    throw new TypeError("This Stremio source requires an IMDb id");
  }
  const id = media.imdbId.toLowerCase();
  return media.type === "tv"
    ? `${id}:${Number(media.season)}:${Number(media.episode)}`
    : id;
}

function publicHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local")
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

async function limitedText(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new StremioError("Stremio addon response is too large");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) {
      throw new StremioError("Stremio addon response is too large");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new StremioError("Stremio addon response is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function fetchJson(fetchImpl, url, options, limit) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Stremio addon returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new StremioError("Stremio addon did not return JSON");
  }
  const text = await limitedText(response, limit);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new StremioError("Stremio addon returned malformed JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StremioError("Stremio addon returned an invalid object");
  }
  return body;
}

function validateManifest(body, expectedType) {
  if (
    typeof body.id !== "string" ||
    typeof body.name !== "string" ||
    typeof body.version !== "string" ||
    !Array.isArray(body.resources)
  ) {
    throw new StremioError("Stremio addon manifest is missing required fields");
  }
  return body.resources.some((resource) => {
    if (resource === "stream") return true;
    if (resource?.name !== "stream") return false;
    return (
      !Array.isArray(resource.types) ||
      resource.types.length === 0 ||
      resource.types.includes(expectedType)
    );
  });
}

function classifyStream(stream) {
  if (!stream || typeof stream !== "object" || Array.isArray(stream)) {
    return { classification: "invalid", reason: "invalid-object" };
  }
  if (stream.externalUrl || stream.ytId || stream.infoHash) {
    return { classification: "external", reason: "external-playback" };
  }

  const url = publicHttpsUrl(stream.url);
  if (!url) {
    return {
      classification: stream.url ? "proxy" : "invalid",
      reason: stream.url ? "non-https-media" : "missing-media",
    };
  }
  if (
    stream.behaviorHints?.notWebReady === true ||
    stream.behaviorHints?.proxyHeaders
  ) {
    return {
      classification: "proxy",
      reason:
        stream.behaviorHints?.notWebReady === true
          ? "not-web-ready"
          : "requires-headers",
    };
  }
  return { classification: "direct", url };
}

function normalizeSubtitles(streams) {
  const tracks = [];
  const seen = new Set();
  for (const stream of streams) {
    for (const subtitle of Array.isArray(stream?.subtitles)
      ? stream.subtitles.slice(0, MAX_SUBTITLES)
      : []) {
      const url = publicHttpsUrl(subtitle?.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const language = String(subtitle.lang ?? "").trim().slice(0, 35);
      tracks.push({
        id: `st:${tracks.length}`,
        url,
        file: url,
        lang: language || undefined,
        language: language || undefined,
        label: language || "Subtitle",
        origin: "source",
      });
    }
  }
  return tracks;
}

export function createStremioResolver(sourceId, config = {}) {
  const manifestUrl = parseStremioManifestUrl(config.manifestUrl);
  if (!manifestUrl) throw new TypeError("A Stremio manifest URL is required");
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const base = new URL(manifestUrl);
  const manifestName = base.pathname.split("/").pop();
  base.pathname = base.pathname.slice(0, -manifestName.length);
  let manifestPromise = null;

  async function manifest(type, options) {
    manifestPromise ??= fetchJson(
      fetchImpl,
      manifestUrl,
      options,
      MANIFEST_LIMIT,
    ).catch((error) => {
      manifestPromise = null;
      throw error;
    });
    const body = await manifestPromise;
    return validateManifest(body, type);
  }

  return async (media, options = {}) => {
    const startedAt = performance.now();
    const type = streamType(media);
    const id = contentId(media);
    if (!(await manifest(type, options))) {
      return {
        candidates: [],
        subtitles: [],
        alternates: [],
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    const endpoint = new URL(
      `stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
      base,
    );
    if (endpoint.origin !== base.origin) {
      throw new TypeError("Invalid Stremio stream endpoint");
    }
    const body = await fetchJson(fetchImpl, endpoint, options, STREAM_LIMIT);
    if (!Array.isArray(body.streams) || body.streams.length > MAX_STREAMS) {
      throw new StremioError("Stremio addon returned an invalid streams array");
    }

    const classified = body.streams.map((stream) => ({
      stream,
      ...classifyStream(stream),
    }));
    const direct = classified.filter(
      (entry) => entry.classification === "direct",
    );
    const candidates = normalizeVariants(
      direct.map(({ stream, url }) => ({
        url,
        type: sourceType(stream),
        quality: stream.name ?? stream.title,
        deliveryMode: "native-direct",
        audioTracks: stream.audioTracks ?? stream.behaviorHints?.audioTracks,
        audioLanguages:
          stream.audioLanguages ?? stream.behaviorHints?.audioLanguages,
        language: stream.language,
        lang: stream.lang,
      })),
      sourceId,
    );
    const alternates = classified
      .filter((entry) => entry.classification !== "direct")
      .map((entry) => ({
        classification: entry.classification,
        reason: entry.reason,
      }));

    return {
      candidates,
      subtitles: normalizeSubtitles(direct.map((entry) => entry.stream)),
      alternates,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  };
}
