import { createHash } from "node:crypto";
import {
  BASE_URL,
  DEFAULT_USER_AGENT,
  FIELD_MAP,
  FRONTEND_TOKEN_SALT,
  SERVERS,
  SERVER_LABELS,
} from "./constants.mjs";
import { ServerPool } from "./server-pool.mjs";

const CACHE_TTL_MS = 60 * 60 * 1_000;

export class DirectError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DirectError";
    this.status = options.status ?? null;
    this.server = options.server ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.details = options.details ?? null;
  }
}

function assertMediaInput(input) {
  if (!["movie", "tv"].includes(input?.type)) {
    throw new TypeError('media.type must be "movie" or "tv"');
  }
  if (!Number.isSafeInteger(Number(input.tmdbId)) || Number(input.tmdbId) <= 0) {
    throw new TypeError("media.tmdbId must be a positive integer");
  }
  if (
    input.type === "tv" &&
    (!Number.isSafeInteger(Number(input.season)) ||
      !Number.isSafeInteger(Number(input.episode)) ||
      Number(input.season) < 0 ||
      Number(input.episode) <= 0)
  ) {
    throw new TypeError("TV media requires valid season and episode numbers");
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function retryAfterMs(response, body) {
  const header = Number(response.headers.get("retry-after"));
  const value = Number(body?.retry_after);
  const candidates = [];
  if (Number.isFinite(header) && header > 0) candidates.push(header * 1_000);
  if (Number.isFinite(value) && value > 0) {
    candidates.push(value < 1_000 ? value * 1_000 : value);
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function detectedType(link, url) {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8") || link.type === "hls") return "hls";
  if (path.endsWith(".mpd") || link.type === "dash") return "dash";
  if (path.endsWith(".mp4") || link.type === "mp4") return "mp4";
  return link.type || "unknown";
}

export function normalizeCandidate(link, server, index = 0) {
  if (!link || typeof link.link !== "string") return null;

  let url;
  try {
    url = new URL(link.link);
  } catch {
    return null;
  }

  const type = detectedType(link, url);
  const resolution = Number(link.resolution);
  const resolutionScore = Number.isFinite(resolution)
    ? resolution >= 144
      ? resolution / 10
      : resolution
    : 0;
  const typeScore = type === "hls" ? 300 : type === "mp4" ? 200 : 100;

  return {
    id: `${server}:${index}`,
    server,
    serverLabel: SERVER_LABELS[server] ?? server,
    url: url.href,
    type,
    declaredType: link.type ?? null,
    resolution: Number.isFinite(resolution) ? resolution : null,
    format: link.format ?? null,
    size: link.size ?? null,
    score: typeScore + resolutionScore,
    raw: link,
  };
}

export class DirectClient {
  #cache = new Map();
  #globalCooldownUntil = 0;

  constructor(options = {}) {
    this.baseUrl = new URL(options.baseUrl ?? BASE_URL);
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
    this.pool = options.pool ?? new ServerPool(options.servers ?? SERVERS);

    if (typeof this.fetch !== "function") {
      throw new TypeError("A fetch implementation is required");
    }
  }

  async getMetadata(media, language = "en-US") {
    assertMediaInput(media);
    const url = new URL(
      `/backend/tmdb/details/${media.type}/${Number(media.tmdbId)}`,
      this.baseUrl,
    );
    url.searchParams.set("language", language);

    const response = await this.fetch(url, {
      headers: this.#contextHeaders(media),
    });
    const body = await this.#readResponse(response);

    if (!response.ok) {
      throw this.#responseError("TMDB metadata request failed", response, body);
    }

    return body;
  }

  async resolveServer(input, server, options = {}) {
    assertMediaInput(input);
    if (!SERVERS.includes(server)) {
      throw new TypeError(`Unknown server "${server}"`);
    }

    const cacheKey = this.#cacheKey(input, server, options);
    const cached = this.#cache.get(cacheKey);
    if (!options.fresh && cached?.expiresAt > Date.now()) return cached.value;

    const globalCooldown = Math.max(0, this.#globalCooldownUntil - Date.now());
    if (globalCooldown > 0) {
      throw new DirectError("Upstream is rate limited and cooling down", {
        status: 429,
        retryable: true,
        retryAfterMs: globalCooldown,
        details: { localCooldown: true },
      });
    }

    const serverCooldown = this.pool.cooldownRemaining(server);
    if (serverCooldown > 0 && !options.ignoreCooldown) {
      throw new DirectError(
        `${SERVER_LABELS[server] ?? server} is cooling down`,
        {
          status: 503,
          server,
          retryable: true,
          retryAfterMs: serverCooldown,
          details: { localCooldown: true },
        },
      );
    }

    const startedAt = performance.now();

    try {
      const media = await this.#hydrateMedia(
        input,
        options.language,
        options.useProvidedMetadata,
      );
      const contextHeaders = this.#contextHeaders(media);
      const token = await this.#createToken(media, contextHeaders);
      const url = this.#sourceUrl(media, server, token, options);
      const response = await this.fetch(url, { headers: contextHeaders });
      const body = await this.#readResponse(response);

      if (!response.ok) {
        throw this.#responseError(
          `Resolver ${server} returned HTTP ${response.status}`,
          response,
          body,
          server,
        );
      }

      const candidates = Array.isArray(body?.links)
        ? body.links
            .map((link, index) => normalizeCandidate(link, server, index))
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
        : [];

      if (candidates.length === 0) {
        throw new DirectError(`Resolver ${server} returned no playable links`, {
          server,
          details: body,
        });
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      const result = {
        server,
        serverLabel: SERVER_LABELS[server],
        latencyMs,
        media,
        candidates,
        subtitles: Array.isArray(body.subtitles) ? body.subtitles : [],
        dubs: Array.isArray(body.dubs) ? body.dubs : [],
        fallback: body.fallback ?? null,
      };

      this.pool.recordSuccess(server, latencyMs);
      this.#cache.set(cacheKey, {
        expiresAt: Date.now() + this.cacheTtlMs,
        value: result,
      });
      return result;
    } catch (error) {
      const wrapped =
        error instanceof DirectError
          ? error
          : new DirectError(error.message, { cause: error, server });
      if (wrapped.status === 429) {
        const cooldownMs = Math.max(wrapped.retryAfterMs ?? 0, 30_000);
        this.#globalCooldownUntil = Math.max(
          this.#globalCooldownUntil,
          Date.now() + cooldownMs,
        );
      }
      this.pool.recordFailure(server, wrapped);
      throw wrapped;
    }
  }

  async resolveAuto(input, options = {}) {
    const preferred = options.servers ?? SERVERS;
    const ranked = this.pool.available(preferred);
    const attempted = [];

    // If every provider is cooling down, allow the highest-ranked one to retry.
    const servers = ranked.length > 0 ? ranked : this.pool.rank(preferred).slice(0, 1);

    for (const server of servers) {
      try {
        const result = await this.resolveServer(input, server, options);
        return { ...result, attemptedServers: [...attempted, server] };
      } catch (error) {
        attempted.push(server);
        if (options.onAttempt) {
          await options.onAttempt({ server, ok: false, error });
        }
        if (error instanceof DirectError && error.status === 429) {
          throw error;
        }
      }
    }

    throw new DirectError("No provider returned playable links", {
      retryable: true,
      details: {
        attemptedServers: attempted,
        serverHealth: this.pool.snapshot(),
      },
    });
  }

  serverHealth() {
    return this.pool.snapshot();
  }

  clearCache() {
    this.#cache.clear();
  }

  async #hydrateMedia(input, language = "en-US", useProvidedMetadata = false) {
    if (useProvidedMetadata || (input.title && input.year && input.date)) {
      return {
        ...input,
        tmdbId: Number(input.tmdbId),
        season: input.type === "tv" ? Number(input.season) : undefined,
        episode: input.type === "tv" ? Number(input.episode) : undefined,
      };
    }

    const metadata = await this.getMetadata(input, language);
    const date =
      input.date ??
      metadata.release_date ??
      metadata.first_air_date ??
      metadata.air_date ??
      "";

    return {
      ...input,
      tmdbId: Number(input.tmdbId),
      season: input.type === "tv" ? Number(input.season) : undefined,
      episode: input.type === "tv" ? Number(input.episode) : undefined,
      imdbId: input.imdbId ?? metadata.imdb_id ?? "",
      title: input.title ?? metadata.title ?? metadata.name ?? "",
      date,
      year: input.year ?? (date ? String(new Date(date).getUTCFullYear()) : ""),
    };
  }

  async #createToken(media, headers) {
    const timestamp = Date.now();
    const frontendToken = createHash("sha512")
      .update(`${timestamp}:${FRONTEND_TOKEN_SALT}:${media.tmdbId}`)
      .digest("hex")
      .slice(0, 64);
    const url = new URL("/backend/token_", this.baseUrl);
    const response = await this.fetch(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        [FIELD_MAP.id]: media.tmdbId,
        [FIELD_MAP.frontendToken]: frontendToken,
        [FIELD_MAP.timestamp]: timestamp,
      }),
    });
    const body = await this.#readResponse(response);

    if (!response.ok) {
      throw this.#responseError("Token request failed", response, body);
    }
    if (!body?.[FIELD_MAP.token] || !body?.[FIELD_MAP.timestamp]) {
      throw new DirectError("Token response is missing required fields", {
        details: body,
      });
    }

    return {
      frontendToken,
      token: body[FIELD_MAP.token],
      timestamp: body[FIELD_MAP.timestamp],
    };
  }

  #sourceUrl(media, server, token, options) {
    const url = new URL(`/backend_/servers/${server}`, this.baseUrl);
    const params = url.searchParams;

    params.set(FIELD_MAP.id, String(media.tmdbId));
    params.set("b", media.type);
    params.set(FIELD_MAP.timestamp, String(token.timestamp));
    params.set(FIELD_MAP.token, token.token);
    params.set(FIELD_MAP.frontendToken, token.frontendToken);
    params.set(FIELD_MAP.title, media.title);
    params.set(FIELD_MAP.year, media.year);
    params.set("date", media.date);

    if (media.type === "tv") {
      params.set(FIELD_MAP.season, String(media.season));
      params.set(FIELD_MAP.episode, String(media.episode));
    }
    if (media.imdbId) params.set(FIELD_MAP.imdbId, media.imdbId);
    if (options.dubCode && options.dubType) {
      params.set("dubCode", options.dubCode);
      params.set("dubType", options.dubType);
    }

    return url;
  }

  #contextHeaders(media) {
    const route =
      media.type === "tv"
        ? `/player/tv/${media.tmdbId}/${media.season}/${media.episode}`
        : `/player/movie/${media.tmdbId}`;

    return {
      accept: "application/json, text/plain, */*",
      origin: this.baseUrl.origin,
      referer: new URL(route, this.baseUrl).href,
      "user-agent": this.userAgent,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    };
  }

  async #readResponse(response) {
    const text = await response.text();
    return safeJson(text) ?? { raw: text.slice(0, 1_000) };
  }

  #responseError(message, response, body, server = null) {
    return new DirectError(message, {
      status: response.status,
      server,
      retryable:
        response.status === 429 ||
        response.status >= 500 ||
        Boolean(body?.retryable),
      retryAfterMs: retryAfterMs(response, body),
      details: body,
    });
  }

  #cacheKey(input, server, options) {
    return JSON.stringify([
      input.type,
      Number(input.tmdbId),
      input.season ?? null,
      input.episode ?? null,
      server,
      options.dubCode ?? null,
      options.dubType ?? null,
    ]);
  }
}

export { SERVERS, SERVER_LABELS };
