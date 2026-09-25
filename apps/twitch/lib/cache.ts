interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, expiresAt: Date.now() + ttl });
}

// Cleanup expired entries periodically
if (typeof setInterval !== "undefined") {
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key);
    }
  }, 60_000);

  // Under Node (tests, scripts) a pending timer keeps the process alive.
  // Workers return a plain number and have no unref, so guard the call.
  if (typeof sweeper === "object" && typeof sweeper.unref === "function") {
    sweeper.unref();
  }
}
