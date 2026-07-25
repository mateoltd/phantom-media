import "server-only";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitRegistry {
  buckets: Map<string, RateLimitBucket>;
  lastPrunedAt: number;
}

const globalRateLimits = globalThis as typeof globalThis & {
  __ewyoutubeRateLimits?: RateLimitRegistry;
};

const registry: RateLimitRegistry =
  globalRateLimits.__ewyoutubeRateLimits ?? {
    buckets: new Map(),
    lastPrunedAt: 0,
  };

globalRateLimits.__ewyoutubeRateLimits = registry;

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitError";
  }
}

export function enforceRateLimit(
  scope: string,
  clientKey: string,
  limit: number,
  windowMs = 60_000
): void {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const key = `${scope}:${clientKey}`;
  const existing = registry.buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    registry.buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    );
  }

  existing.count++;
}

function pruneExpiredBuckets(now: number): void {
  if (now - registry.lastPrunedAt < 60_000) return;

  for (const [key, bucket] of registry.buckets) {
    if (bucket.resetAt <= now) registry.buckets.delete(key);
  }
  registry.lastPrunedAt = now;
}
