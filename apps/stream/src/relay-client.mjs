import {
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
} from "node:crypto";
import { ServerPool } from "./server-pool.mjs";
import { SOURCE_ALIASES, SOURCE_IDS } from "./source-ids.mjs";
import { normalizeVariants, numericResolution } from "./providers/normalize.mjs";

export { SOURCE_ALIASES, SOURCE_IDS };

export const RELAY_BASE_URL =
  process.env.RELAY_BASE_URL ?? "https://cinemaos.tech";

// These values are shipped in the upstream browser bundles.
const HASH_PRIMARY =
  "a7f3b9c2e8d4f1a6b5c9e2d7f4a8b3c6e1d9f7a4b2c8e5d3f9a6b4c1e7d2f8a5";
const HASH_SECONDARY =
  "d3f8a5b2c9e6d1f7a4b8c5e2d9f3a6b1c7e4d8f2a9b5c3e7d4f1a8b6c2e9d5f3";
const GATE_TOKEN = "6775dc8e702c08643385273df088c14952c590ddda02d14f";
const ENCRYPTION_KEY =
  "a1b2c3d4e4f6477658455678901477567890abcdef1234567890abcdef123456";
const CACHE_TTL_MS = 10 * 60 * 1_000;

export class RelayError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "RelayError";
    this.status = options.status ?? null;
    this.server = options.server ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.details = options.details ?? null;
  }
}

function assertMediaInput(media) {
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

function contentString(media) {
  const values = [`tmdbId:${Number(media.tmdbId)}`];
  if (media.imdbId) values.push(`imdbId:${media.imdbId}`);
  if (media.type === "tv") {
    values.push(`seasonId:${Number(media.season)}`);
    values.push(`episodeId:${Number(media.episode)}`);
  }
  return values.join("|");
}

export function generateContentHash(media) {
  assertMediaInput(media);
  const first = createHmac("sha256", HASH_PRIMARY)
    .update(contentString(media))
    .digest("hex");
  return createHmac("sha256", HASH_SECONDARY)
    .update(first)
    .digest("hex");
}

export function decryptRelayData(input) {
  const payload = input?.data ?? input;
  if (
    !payload ||
    typeof payload.encrypted !== "string" ||
    typeof payload.cin !== "string" ||
    typeof payload.mao !== "string"
  ) {
    throw new RelayError("Upstream returned invalid encrypted data");
  }

  const iv = Buffer.from(payload.cin, "hex");
  const authTag = Buffer.from(payload.mao, "hex");
  const salt = payload.salt
    ? Buffer.from(payload.salt, "hex")
    : createHash("sha256").update(iv).digest().subarray(0, 32);
  if (iv.length !== 16 || authTag.length !== 16) {
    throw new RelayError("Upstream returned invalid encryption parameters");
  }

  const usesKeyDerivation = payload.version == null || payload.version >= 1;
  const key = usesKeyDerivation
    ? pbkdf2Sync(ENCRYPTION_KEY, salt, 100_000, 32, "sha256")
    : Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, "hex")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

function retryAfterMs(response, body) {
  const header = Number(response.headers.get("retry-after"));
  const bodyValue = Number(body?.retry_after ?? body?.retryAfter);
  const candidates = [];
  if (Number.isFinite(header) && header > 0) candidates.push(header * 1_000);
  if (Number.isFinite(bodyValue) && bodyValue > 0) {
    candidates.push(bodyValue < 1_000 ? bodyValue * 1_000 : bodyValue);
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

/**
 * Upstream keys each entry by the host that serves it, and hangs a map of
 * per-resolution variants off it. Flattening is all this does; naming,
 * de-duplication and scoring belong to `normalizeVariants`, which is the only
 * thing allowed to mint a candidate.
 */
function flattenRelaySources(body) {
  const variants = [];
  for (const source of Object.values(body?.sources ?? {})) {
    if (source?.url) {
      variants.push({
        url: source.url,
        type: source.type,
        resolution: numericResolution(source.quality),
      });
    }
    for (const [quality, variant] of Object.entries(source?.qualities ?? {})) {
      if (variant?.url) {
        variants.push({
          url: variant.url,
          type: variant.type ?? source.type,
          resolution: numericResolution(quality),
        });
      }
    }
  }
  return variants;
}

export class RelayClient {
  #cache = new Map();
  #globalCooldownUntil = 0;

  constructor(options = {}) {
    this.baseUrl = new URL(options.baseUrl ?? RELAY_BASE_URL);
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
    this.pool =
      options.pool ??
      new ServerPool(options.scrapers ?? SOURCE_IDS);
    if (typeof this.fetch !== "function") {
      throw new TypeError("A fetch implementation is required");
    }
  }

  async resolveScraper(media, scraper, options = {}) {
    assertMediaInput(media);
    if (!SOURCE_IDS.includes(scraper)) {
      throw new TypeError(`Unknown source "${scraper}"`);
    }

    const cacheKey = JSON.stringify([
      media.type,
      Number(media.tmdbId),
      media.season ?? null,
      media.episode ?? null,
      scraper,
    ]);
    const cached = this.#cache.get(cacheKey);
    if (!options.fresh && cached?.expiresAt > Date.now()) return cached.value;

    const globalCooldown = Math.max(0, this.#globalCooldownUntil - Date.now());
    if (globalCooldown > 0) {
      throw new RelayError("Upstream is rate limited and cooling down", {
        status: 429,
        retryable: true,
        retryAfterMs: globalCooldown,
        details: { localCooldown: true },
      });
    }
    const scraperCooldown = this.pool.cooldownRemaining(scraper);
    if (scraperCooldown > 0 && !options.ignoreCooldown) {
      throw new RelayError(
        `${SOURCE_ALIASES[scraper]} is cooling down`,
        {
          status: 503,
          server: scraper,
          retryable: true,
          retryAfterMs: scraperCooldown,
          details: { localCooldown: true },
        },
      );
    }

    const startedAt = performance.now();
    try {
      const url = new URL("/api/providerv4/scrape", this.baseUrl);
      url.searchParams.set("type", media.type);
      url.searchParams.set("tmdbId", String(Number(media.tmdbId)));
      if (media.imdbId) url.searchParams.set("imdbId", media.imdbId);
      if (media.type === "tv") {
        url.searchParams.set("seasonId", String(Number(media.season)));
        url.searchParams.set("episodeId", String(Number(media.episode)));
      }
      if (media.title) url.searchParams.set("t", media.title);
      if (media.year) url.searchParams.set("ry", String(media.year));
      url.searchParams.set("secret", generateContentHash(media));
      url.searchParams.set("_gt", GATE_TOKEN);
      url.searchParams.set("scraper", scraper);

      const route =
        media.type === "tv"
          ? `/player/${media.tmdbId}/${media.season}/${media.episode}`
          : `/player/${media.tmdbId}`;
      const response = await this.fetch(url, {
        headers: {
          accept: "application/json",
          origin: this.baseUrl.origin,
          referer: new URL(route, this.baseUrl).href,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/138.0.0.0 Safari/537.36",
        },
        // The caller gives up long before upstream does. Without this the
        // subrequest keeps running after nobody is waiting for it, which on a
        // worker is billed time spent on an answer that will be thrown away.
        signal: options.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 1_000) };
      }
      if (!response.ok) {
        throw new RelayError(
          `${SOURCE_ALIASES[scraper]} returned HTTP ${response.status}`,
          {
            status: response.status,
            server: scraper,
            retryable: response.status === 429 || response.status >= 500,
            retryAfterMs: retryAfterMs(response, body),
            details: body,
          },
        );
      }

      const decrypted = body?.encrypted ? decryptRelayData(body) : body;
      const candidates = normalizeVariants(
        flattenRelaySources(decrypted),
        scraper,
      );
      if (candidates.length === 0) {
        throw new RelayError(
          `${SOURCE_ALIASES[scraper]} returned no playable sources`,
          { server: scraper, details: decrypted },
        );
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      const result = {
        server: scraper,
        serverLabel: SOURCE_ALIASES[scraper],
        latencyMs,
        media,
        candidates,
        subtitles: Array.isArray(decrypted?.captions)
          ? decrypted.captions
          : [],
        dubs: [],
        fallback: null,
      };
      this.pool.recordSuccess(scraper, latencyMs);
      this.#cache.set(cacheKey, {
        expiresAt: Date.now() + this.cacheTtlMs,
        value: result,
      });
      return result;
    } catch (error) {
      const wrapped =
        error instanceof RelayError
          ? error
          : new RelayError(error.message, { cause: error, server: scraper });
      if (wrapped.status === 429) {
        const cooldownMs = Math.max(wrapped.retryAfterMs ?? 0, 30_000);
        this.#globalCooldownUntil = Math.max(
          this.#globalCooldownUntil,
          Date.now() + cooldownMs,
        );
      }
      this.pool.recordFailure(scraper, wrapped);
      throw wrapped;
    }
  }

  serverHealth() {
    return this.pool.snapshot();
  }
}
