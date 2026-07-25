import "server-only";

import {
  fetch as undiciFetch,
  ProxyAgent,
  type RequestInit as UndiciRequestInit,
} from "undici";

const MAX_PROXY_LIST_BYTES = 512 * 1024;
const DEFAULT_REFRESH_SECONDS = 10 * 60;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_COOLDOWN_SECONDS = 30;
const DEFAULT_CHALLENGE_COOLDOWN_SECONDS = 10 * 60;
const DEFAULT_MIN_INTERVAL_MS = 5_000;
const MAX_COOLDOWN_MS = 30 * 60 * 1000;
const RETRYABLE_STATUS_CODES = new Set([403, 407, 408, 429, 451, 500, 502, 503, 504]);

interface ProxyHealth {
  url: string;
  failures: number;
  cooldownUntil: number;
  nextAvailableAt: number;
}

export type ProxyFailureReason = "transient" | "challenge";

interface ProxyPoolRegistry {
  proxies: ProxyHealth[];
  cursor: number;
  sourceKey: string;
  refreshAfter: number;
  refreshPromise?: Promise<void>;
  agents: Map<string, ProxyAgent>;
}

const globalProxyPool = globalThis as typeof globalThis & {
  __ewyoutubeProxyPool?: ProxyPoolRegistry;
};

const registry: ProxyPoolRegistry =
  globalProxyPool.__ewyoutubeProxyPool ?? {
    proxies: [],
    cursor: 0,
    sourceKey: "",
    refreshAfter: 0,
    agents: new Map(),
  };

globalProxyPool.__ewyoutubeProxyPool = registry;

export class ProxyPoolUnavailableError extends Error {}

export function hasConfiguredProxySource(): boolean {
  return Boolean(
    process.env.EWYOUTUBE_PROXY_LIST_URL?.trim() ||
      process.env.EWYOUTUBE_PROXY_URLS?.trim() ||
      process.env.EWYOUTUBE_PROXY_URL?.trim()
  );
}

export function isDirectProxyFallbackAllowed(): boolean {
  return process.env.PROXY_ALLOW_DIRECT_FALLBACK === "true";
}

export async function fetchThroughProxyPool(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const excluded = new Set<string>();
  const maxAttempts = readPositiveInteger(
    process.env.PROXY_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let proxyUrl: string | null;
    try {
      proxyUrl = await acquireProxy(excluded);
    } catch (error) {
      lastError = error;
      break;
    }
    if (!proxyUrl) break;
    excluded.add(proxyUrl);
    await waitForProxySlot(proxyUrl);

    try {
      const response = await undiciFetch(input as never, {
        ...(init as unknown as UndiciRequestInit),
        dispatcher: agentFor(proxyUrl),
      });

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        await response.body?.cancel();
        reportProxyFailure(
          proxyUrl,
          response.status === 403 || response.status === 429
            ? "challenge"
            : "transient"
        );
        lastError = new Error(`Upstream returned retryable status ${response.status}`);
        continue;
      }

      reportProxySuccess(proxyUrl);
      return response as unknown as Response;
    } catch (error) {
      reportProxyFailure(proxyUrl);
      lastError = error;
    }
  }

  if (isDirectProxyFallbackAllowed()) {
    return fetch(input, init);
  }

  if (lastError) {
    throw new ProxyPoolUnavailableError(
      "All available proxy exits failed the upstream request",
      { cause: lastError }
    );
  }

  throw new ProxyPoolUnavailableError(
    "No healthy proxy exit is currently available"
  );
}

export async function getProxyCandidates(
  requestedLimit?: number
): Promise<string[]> {
  await refreshProxyPool();

  const limit = Math.min(
    requestedLimit ??
      readPositiveInteger(
        process.env.PROXY_MAX_ATTEMPTS,
        DEFAULT_MAX_ATTEMPTS
      ),
    registry.proxies.length
  );
  const now = Date.now();
  const startIndex = registry.cursor;
  const candidates: string[] = [];

  for (let offset = 0; offset < registry.proxies.length; offset++) {
    const index = (startIndex + offset) % registry.proxies.length;
    const proxy = registry.proxies[index];
    if (proxy.cooldownUntil > now) continue;
    candidates.push(proxy.url);
    if (candidates.length >= limit) break;
  }

  if (candidates.length > 0) {
    registry.cursor = (startIndex + 1) % registry.proxies.length;
  }

  return candidates;
}

export function reportProxyFailure(
  proxyUrl: string,
  reason: ProxyFailureReason = "transient"
): void {
  const proxy = registry.proxies.find((entry) => entry.url === proxyUrl);
  if (!proxy) return;

  proxy.failures = Math.min(proxy.failures + 1, 10);
  const baseCooldown = (
    reason === "challenge"
      ? readPositiveInteger(
          process.env.PROXY_CHALLENGE_COOLDOWN_SECONDS,
          DEFAULT_CHALLENGE_COOLDOWN_SECONDS
        )
      : readPositiveInteger(
          process.env.PROXY_COOLDOWN_BASE_SECONDS,
          DEFAULT_COOLDOWN_SECONDS
        )
  ) * 1000;
  proxy.cooldownUntil =
    Date.now() +
    Math.min(baseCooldown * 2 ** (proxy.failures - 1), MAX_COOLDOWN_MS);
}

export function reportProxySuccess(proxyUrl: string): void {
  const proxy = registry.proxies.find((entry) => entry.url === proxyUrl);
  if (!proxy) return;
  proxy.failures = 0;
  proxy.cooldownUntil = 0;
}

export async function waitForProxySlot(proxyUrl: string): Promise<void> {
  const proxy = registry.proxies.find((entry) => entry.url === proxyUrl);
  if (!proxy) return;

  const intervalMs = readPositiveInteger(
    process.env.PROXY_MIN_INTERVAL_MS,
    DEFAULT_MIN_INTERVAL_MS
  );
  const now = Date.now();
  const availableAt = Math.max(now, proxy.nextAvailableAt ?? 0);
  proxy.nextAvailableAt = availableAt + intervalMs;
  const waitMs = availableAt - now;
  if (waitMs <= 0) return;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, waitMs);
  });
}

export function isBotChallenge(output: string): boolean {
  return [
    /\bsign in to confirm you(?:'|’)re not a bot\b/i,
    /\bconfirm you(?:'|’)re not a bot\b/i,
    /\bcaptcha\b/i,
    /\bguest session.+rate limit\b/i,
  ].some((pattern) => pattern.test(output));
}

export function isRetryableProxyFailure(output: string): boolean {
  return [
    /\bHTTP Error (?:403|407|408|429|451|500|502|503|504)\b/i,
    /\b(?:proxy|tunnel) (?:error|connection|failed|refused|timed out)\b/i,
    /\bunable to connect to proxy\b/i,
    /\bconnection (?:reset|refused|timed out)\b/i,
    /\bmetadata request timed out\b/i,
    /\btemporary failure in name resolution\b/i,
    /\bsign in to confirm you(?:'|’)re not a bot\b/i,
    /\bconfirm you(?:'|’)re not a bot\b/i,
    /\bcaptcha\b/i,
    /\bthis content isn't available\b/i,
  ].some((pattern) => pattern.test(output));
}

export function redactProxySecrets(value: string): string {
  let redacted = value;
  const sourceUrl = process.env.EWYOUTUBE_PROXY_LIST_URL?.trim();
  const configured = [
    sourceUrl,
    process.env.EWYOUTUBE_PROXY_URL?.trim(),
    process.env.EWYOUTUBE_PROXY_URLS?.trim(),
    ...registry.proxies.map((proxy) => proxy.url),
  ].filter((entry): entry is string => Boolean(entry));

  for (const secret of configured) {
    redacted = redacted.replaceAll(secret, "[proxy]");
  }

  return redacted
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[credentials]@")
    .replace(
      /\b(?:[A-Za-z0-9._~-]+):(?:[^\s:@]+)@(?:[A-Za-z0-9.-]+):\d{2,5}\b/g,
      "[proxy]"
    );
}

async function acquireProxy(excluded: Set<string>): Promise<string | null> {
  const candidates = await getProxyCandidates(registry.proxies.length || 1);
  return candidates.find((proxy) => !excluded.has(proxy)) ?? null;
}

async function refreshProxyPool(): Promise<void> {
  const sourceUrl = process.env.EWYOUTUBE_PROXY_LIST_URL?.trim() ?? "";
  const staticSource = [
    process.env.EWYOUTUBE_PROXY_URLS?.trim(),
    process.env.EWYOUTUBE_PROXY_URL?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const sourceKey = `${sourceUrl}\u0000${staticSource}`;

  if (sourceKey !== registry.sourceKey) {
    registry.sourceKey = sourceKey;
    registry.refreshAfter = 0;
  }

  if (Date.now() < registry.refreshAfter && registry.proxies.length > 0) {
    return;
  }
  if (registry.refreshPromise) return registry.refreshPromise;

  registry.refreshPromise = (async () => {
    const rawSources = [staticSource];

    if (sourceUrl) {
      rawSources.push(await downloadProxyList(sourceUrl));
    }

    const urls = [...new Set(rawSources.flatMap(parseProxyPayload))];
    if (urls.length === 0) {
      if (registry.proxies.length > 0) {
        registry.refreshAfter = Date.now() + 60_000;
        return;
      }
      throw new ProxyPoolUnavailableError(
        "The configured proxy source returned no usable entries"
      );
    }

    const previous = new Map(
      registry.proxies.map((proxy) => [proxy.url, proxy])
    );
    registry.proxies = urls.map(
      (url) =>
        previous.get(url) ?? {
          url,
          failures: 0,
          cooldownUntil: 0,
          nextAvailableAt: 0,
        }
    );
    registry.cursor %= registry.proxies.length;
    registry.refreshAfter =
      Date.now() +
      readPositiveInteger(
        process.env.EWYOUTUBE_PROXY_LIST_REFRESH_SECONDS,
        DEFAULT_REFRESH_SECONDS
      ) *
        1000;

    console.info(
      JSON.stringify({
        message: "proxy pool refreshed",
        entries: registry.proxies.length,
      })
    );
  })();

  try {
    await registry.refreshPromise;
  } catch (error) {
    if (registry.proxies.length === 0) throw error;
    registry.refreshAfter = Date.now() + 60_000;
  } finally {
    registry.refreshPromise = undefined;
  }
}

async function downloadProxyList(sourceUrl: string): Promise<string> {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") {
    throw new ProxyPoolUnavailableError(
      "The proxy-list source must use HTTPS"
    );
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "text/plain, application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body) {
    throw new ProxyPoolUnavailableError(
      "The configured proxy-list source could not be refreshed"
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PROXY_LIST_BYTES) {
    await response.body.cancel();
    throw new ProxyPoolUnavailableError("The proxy list is too large");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROXY_LIST_BYTES) {
      await reader.cancel();
      throw new ProxyPoolUnavailableError("The proxy list is too large");
    }
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

function parseProxyPayload(payload: string): string[] {
  const trimmed = payload.trim();
  if (!trimmed) return [];

  let entries: unknown = trimmed.split(/\r?\n|,/);
  if (trimmed.startsWith("[")) {
    try {
      entries = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => (typeof entry === "string" ? normalizeProxy(entry) : null))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeProxy(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.startsWith("#")) return null;

  let normalized = candidate;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const usernameStyle = /^([^:@\s]+):([^@\s]+)@([^:\s]+):(\d{2,5})$/.exec(
      candidate
    );
    if (usernameStyle) {
      const [, username, password, host, port] = usernameStyle;
      normalized = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
    } else {
      const directStyle = /^([^:\s]+):(\d{2,5}):([^:\s]+):(.+)$/.exec(
        candidate
      );
      if (!directStyle) return null;
      const [, host, port, username, password] = directStyle;
      normalized = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
    }
  }

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname || !url.port || !url.username || !url.password) {
      return null;
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function agentFor(proxyUrl: string): ProxyAgent {
  let agent = registry.agents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    registry.agents.set(proxyUrl, agent);
  }
  return agent;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
