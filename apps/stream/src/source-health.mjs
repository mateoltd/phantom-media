// Shared source health: cooldowns keyed by failure-domain plus singleflight
// coalescing keyed by source+title/episode+language+freshness.
//
// Framework-agnostic (.mjs) so the browser router, the Node resolve route,
// and unit tests share one implementation. Persistence is in-memory with
// header propagation; a KV/D1 adapter can be plugged in later via
// setCooldownStore() without changing callers.

export const SOURCE_HEALTH_COOLDOWN_CAP_MS = 60_000;
export const SOURCE_HEALTH_DEFAULT_COOLDOWN_MS = 60_000;

const cooldowns = new Map();
const inflight = new Map();
let externalStore = null;

export function setCooldownStore(store) {
  externalStore = store ?? null;
}

function nowMs(now) {
  return typeof now === "number" ? now : Date.now();
}

export function cooldownKeyFor(failureDomain) {
  return `cooldown:${String(failureDomain ?? "")}`;
}

export function normalizeRetryAfterMs(retryAfterMs, cap = SOURCE_HEALTH_COOLDOWN_CAP_MS) {
  const value = Number(retryAfterMs);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), cap);
}

// Record a failure-domain cooldown. Returns the absolute expiry timestamp.
export function recordCooldown(failureDomain, retryAfterMs, options = {}) {
  const now = nowMs(options.now);
  const cap = options.capMs ?? SOURCE_HEALTH_COOLDOWN_CAP_MS;
  const fallback = options.fallbackMs ?? SOURCE_HEALTH_DEFAULT_COOLDOWN_MS;
  const hint = normalizeRetryAfterMs(retryAfterMs, cap);
  const duration = hint > 0 ? hint : Math.min(Math.max(fallback, 0), cap);
  if (duration <= 0) return 0;
  const until = now + duration;
  const key = cooldownKeyFor(failureDomain);
  const existing = cooldowns.get(key) ?? 0;
  const next = Math.max(existing, until);
  cooldowns.set(key, next);
  try {
    externalStore?.set?.(key, next);
  } catch {
    // Optional persistence must never break routing.
  }
  return next;
}

export function readCooldown(failureDomain, options = {}) {
  const now = nowMs(options.now);
  const key = cooldownKeyFor(failureDomain);
  let until = cooldowns.get(key) ?? 0;
  if ((until <= now || !until) && externalStore?.get) {
    try {
      const persisted = Number(externalStore.get(key));
      if (Number.isFinite(persisted) && persisted > until) {
        until = persisted;
        cooldowns.set(key, until);
      }
    } catch {
      // Ignore store failures.
    }
  }
  if (until <= now) {
    if (cooldowns.get(key) === until) cooldowns.delete(key);
    return 0;
  }
  return until;
}

export function isCooling(failureDomain, options = {}) {
  return readCooldown(failureDomain, options) > nowMs(options.now);
}

export function clearCooldown(failureDomain) {
  const key = cooldownKeyFor(failureDomain);
  cooldowns.delete(key);
  try {
    externalStore?.delete?.(key);
  } catch {
    // ignore
  }
}

export function clearAllCooldowns() {
  cooldowns.clear();
  try {
    externalStore?.clear?.();
  } catch {
    // ignore
  }
}

// Build the cooling map consumed by orderSources(): { [sourceId]: until }.
export function coolingMapFor(sourceIds, failureDomainFor, options = {}) {
  const now = nowMs(options.now);
  const map = {};
  for (const id of sourceIds ?? []) {
    try {
      map[id] = readCooldown(failureDomainFor(id), { ...options, now });
    } catch {
      map[id] = 0;
    }
  }
  return map;
}

// Singleflight key: source + title identity + language + freshness.
export function resolveKeyFor({ sourceId, type, tmdbId, season, episode, audioLanguage, fresh }) {
  return [
    String(sourceId ?? ""),
    String(type ?? ""),
    String(Number(tmdbId) || 0),
    String(Number(season ?? 0)),
    String(Number(episode ?? 0)),
    String(audioLanguage ?? "und").toLowerCase(),
    fresh === true ? "fresh" : "cached",
  ].join(":");
}

// Coalesce concurrent resolutions for the same key. Concurrent callers share
// one promise; the entry is removed on settle so later calls re-resolve.
export function singleflight(key, task) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = Promise.resolve()
    .then(task)
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

export function clearSingleflight(key) {
  if (key === undefined) inflight.clear();
  else inflight.delete(key);
}

// Header propagation (no new infra): the resolve route emits the strongest
// domain cooldown it knows; the browser applies it to the shared map.
export const COOLDOWN_DOMAIN_HEADER = "x-phantom-cooldown-domain";
export const COOLDOWN_MS_HEADER = "x-phantom-cooldown-ms";

export function cooldownResponseHeaders(failureDomain, retryAfterMs) {
  const ms = normalizeRetryAfterMs(retryAfterMs);
  if (!failureDomain || ms <= 0) return {};
  return {
    [COOLDOWN_DOMAIN_HEADER]: String(failureDomain),
    [COOLDOWN_MS_HEADER]: String(ms),
  };
}

export function applyCooldownHeaders(headers, options = {}) {
  const get = (name) => {
    if (typeof headers?.get === "function") return headers.get(name);
    return headers?.[name] ?? null;
  };
  const domain = get(COOLDOWN_DOMAIN_HEADER);
  const ms = Number(get(COOLDOWN_MS_HEADER) ?? get("retry-after") * 1000);
  if (!domain || !Number.isFinite(ms) || ms <= 0) return 0;
  return recordCooldown(domain, ms, options);
}
