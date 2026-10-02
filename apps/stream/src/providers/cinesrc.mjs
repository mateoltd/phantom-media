import { Buffer } from "node:buffer";
import { debugEvent } from "../debug.mjs";
import {
  cinesrcCapacityDomains,
  cinesrcControlPlaneDomain,
  cinesrcMediaFailureDomain,
} from "../failure-domain.mjs";
import { normalizeVariants } from "./normalize.mjs";
import { evaluateCineSrcScripts } from "./cinesrc-runtime.mjs";
import { proxyDiscoveredCineSrcCandidate } from "./wrapper-media-proxy.mjs";
import { hlsAudioLanguages } from "../media-language.mjs";

export const CINESRC_FAILURE_DOMAIN = cinesrcControlPlaneDomain();

const DEFAULT_ORIGIN = "https://cinesrc.st";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/138.0.0.0 Safari/537.36";
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_ACTION_BYTES = 2 * 1024 * 1024;
const MAX_SCRIPTS = 24;
const MAX_PROVIDERS = 6;
// Bounded lane race: verify up to 5 provider lanes in parallel, rank them,
// return the best first but keep the rest for failover.
export const CINESRC_MAX_RACE_LANES = 5;
export const CINESRC_LANE_TIMEOUT_MS = 9_000;
const MAX_CHALLENGE_ATTEMPTS = 2;
const CACHE_TTL_MS = 15_000;
const CACHE = new Map();
const ACTION_REFERENCE =
  /createServerReference\)\("([a-f0-9]{40,64})"[\s\S]{0,240}?"(getProviderList|getStream)"\)/g;
const ROOT_SCRIPT = /["'](\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,255}\.js(?:\?[^"']{0,128})?)["']/g;
const PUBLIC_HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export class CineSrcError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CineSrcError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.details = options.details ?? null;
  }
}

function assertMedia(media) {
  if (!['movie', 'tv'].includes(media?.type)) {
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

function originUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !PUBLIC_HOST.test(url.hostname)
  ) {
    throw new TypeError("CineSrc origin must be a public HTTPS origin");
  }
  return url;
}

function pageUrlFor(media, origin) {
  const page = new URL(`/embed/${media.type}/${Number(media.tmdbId)}`, origin);
  if (media.type === "tv") {
    page.searchParams.set("season", String(Number(media.season)));
    page.searchParams.set("episode", String(Number(media.episode)));
  }
  return page;
}

async function limitedText(response, limit, stage) {
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
      if (size > limit) {
        throw new CineSrcError(`CineSrc ${stage} exceeded the size limit`, {
          details: { stage },
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function fetchText(fetchImpl, input, init, limit, stage) {
  let response;
  try {
    response = await fetchImpl(input, { ...init, redirect: "manual" });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new CineSrcError(`CineSrc ${stage} request failed`, {
      cause: error,
      retryable: true,
      details: { stage },
    });
  }
  if (!response.ok) {
    response.body?.cancel();
    throw new CineSrcError(
      `CineSrc ${stage} returned HTTP ${response.status}`,
      {
        status: response.status,
        retryable:
          response.status === 403 ||
          response.status === 404 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
        details: { stage },
      },
    );
  }
  return limitedText(response, limit, stage);
}

function htmlScriptUrls(html, pageUrl) {
  const urls = [];
  const seen = new Set();
  const pattern = /<script\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  for (const match of String(html).matchAll(pattern)) {
    let url;
    try {
      url = new URL(match[1] ?? match[2], pageUrl);
    } catch {
      continue;
    }
    if (
      url.origin !== pageUrl.origin ||
      url.username ||
      url.password ||
      !url.pathname.endsWith(".js") ||
      seen.has(url.href)
    ) {
      continue;
    }
    seen.add(url.href);
    urls.push(url);
    if (urls.length >= MAX_SCRIPTS) break;
  }
  return urls;
}

export function extractCineSrcContract(sources) {
  const actionIds = {};
  let actionSource = "";
  for (const source of sources ?? []) {
    ACTION_REFERENCE.lastIndex = 0;
    for (const match of String(source).matchAll(ACTION_REFERENCE)) {
      actionIds[match[2]] = match[1];
      actionSource ||= String(source);
    }
  }
  if (!actionIds.getProviderList || !actionIds.getStream || !actionSource) {
    return null;
  }
  const anchor = actionSource.indexOf('"getProviderList"');
  const window = actionSource.slice(Math.max(0, anchor - 800), anchor + 2_400);
  const runtimePaths = [];
  const seen = new Set();
  ROOT_SCRIPT.lastIndex = 0;
  for (const match of window.matchAll(ROOT_SCRIPT)) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);
    runtimePaths.push(path);
  }
  if (runtimePaths.length < 2) return null;
  return Object.freeze({
    providerListAction: actionIds.getProviderList,
    streamAction: actionIds.getStream,
    runtimePaths: Object.freeze(runtimePaths.slice(0, 6)),
  });
}

export function parseCineSrcRscValue(payload, index = 1) {
  const prefix = `${index}:`;
  const line = String(payload)
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(prefix));
  if (!line) {
    throw new CineSrcError("CineSrc action returned an unsupported response", {
      details: { stage: "action-decode" },
    });
  }
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch (error) {
    throw new CineSrcError("CineSrc action returned invalid data", {
      cause: error,
      details: { stage: "action-decode" },
    });
  }
}

export function normalizeCineSrcProviders(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((entry) => {
      const id = String(entry?.id ?? "");
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((entry) => ({
      id: String(entry.id),
      rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : 0,
    }))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, MAX_PROVIDERS);
}

export function assertCineSrcMediaUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("CineSrc media URL is invalid");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !PUBLIC_HOST.test(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    url.pathname === "/" ||
    url.pathname.length > 2_048 ||
    url.search.length > 4_096
  ) {
    throw new TypeError("CineSrc media URL is not a public HTTPS target");
  }
  url.hash = "";
  return url;
}

function actionHeaders(actionId, origin) {
  return {
    accept: "text/x-component",
    "content-type": "text/plain;charset=UTF-8",
    "next-action": actionId,
    origin: origin.origin,
    referer: `${origin.origin}/`,
    "user-agent": USER_AGENT,
  };
}

async function callAction(fetchImpl, pageUrl, actionId, args, signal, stage) {
  return fetchText(
    fetchImpl,
    pageUrl,
    {
      method: "POST",
      headers: actionHeaders(actionId, new URL(pageUrl.origin)),
      body: JSON.stringify(args),
      signal,
    },
    MAX_ACTION_BYTES,
    stage,
  );
}

async function discoverContract(fetchImpl, pageUrl, signal) {
  const html = await fetchText(
    fetchImpl,
    pageUrl,
    {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": USER_AGENT,
      },
      signal,
    },
    MAX_PAGE_BYTES,
    "embed page",
  );
  const sources = [];
  for (const scriptUrl of htmlScriptUrls(html, pageUrl)) {
    try {
      sources.push(
        await fetchText(
          fetchImpl,
          scriptUrl,
          {
            headers: { accept: "text/javascript,*/*", "user-agent": USER_AGENT },
            signal,
          },
          MAX_SCRIPT_BYTES,
          "application script",
        ),
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      continue;
    }
    const contract = extractCineSrcContract(sources);
    if (contract) return contract;
  }
  throw new CineSrcError("CineSrc's current player contract was not found", {
    retryable: true,
    details: { stage: "contract-discovery" },
  });
}

async function runtimeSources(fetchImpl, contract, origin, signal) {
  const sources = [];
  for (const path of contract.runtimePaths) {
    const url = new URL(path, origin);
    if (url.origin !== origin.origin || !url.pathname.endsWith(".js")) continue;
    sources.push(
      await fetchText(
        fetchImpl,
        url,
        {
          headers: { accept: "text/javascript,*/*", "user-agent": USER_AGENT },
          signal,
        },
        MAX_SCRIPT_BYTES,
        "challenge runtime",
      ),
    );
  }
  return sources;
}

function challengeQuery(media) {
  const tuple = [
    media.type,
    String(Number(media.tmdbId)),
    media.type === "tv" ? String(Number(media.season)) : null,
    media.type === "tv" ? String(Number(media.episode)) : null,
  ];
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

async function challengeProof(
  fetchImpl,
  media,
  pageUrl,
  scripts,
  signal,
  runtimeFactory,
) {
  const query = challengeQuery(media);
  const bootstrapText = await fetchText(
    fetchImpl,
    new URL("/api/c/bootstrap", pageUrl.origin),
    {
      method: "POST",
      headers: {
        referer: `${pageUrl.origin}/`,
        "user-agent": USER_AGENT,
        "x-cs-q": query,
      },
      signal,
    },
    MAX_ACTION_BYTES,
    "challenge bootstrap",
  );
  let bootstrap;
  try {
    bootstrap = JSON.parse(bootstrapText);
  } catch {
    throw new CineSrcError("CineSrc challenge bootstrap was invalid", {
      retryable: true,
      details: { stage: "challenge-bootstrap" },
    });
  }
  if (
    typeof bootstrap?.r !== "string" ||
    !bootstrap.r ||
    bootstrap.r.length > 512 ||
    typeof bootstrap?.p !== "string" ||
    !bootstrap.p ||
    bootstrap.p.length > 1_024
  ) {
    throw new CineSrcError("CineSrc challenge bootstrap was invalid", {
      retryable: true,
      details: { stage: "challenge-bootstrap" },
    });
  }
  const challengeFetch = async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    headers.set("referer", pageUrl.href);
    headers.set("user-agent", USER_AGENT);
    if (
      url.origin === pageUrl.origin &&
      (url.pathname === "/api/c/issue" ||
        url.pathname === "/api/c/stage2/issue")
    ) {
      headers.set("x-cs-r", bootstrap.r);
      headers.set("x-cs-q", query);
      if (url.pathname === "/api/c/issue") headers.set("x-cs-p", bootstrap.p);
    }
    return fetchImpl(url, { ...init, headers, signal: init.signal ?? signal });
  };
  const runtime = runtimeFactory(scripts, {
    pageUrl: pageUrl.href,
    fetchImpl: challengeFetch,
  });
  if (!runtime?.api?.gc || !runtime?.api?.dr || !runtime?.scope?.__ss2_challenge?.gc) {
    throw new CineSrcError("CineSrc challenge runtime was incompatible", {
      retryable: true,
      details: { stage: "challenge-runtime" },
    });
  }
  const [primary, stage2] = await Promise.all([
    runtime.api.gc(),
    runtime.scope.__ss2_challenge.gc(),
  ]);
  if (typeof primary !== "string" || typeof stage2 !== "string") {
    throw new CineSrcError("CineSrc challenge generation failed", {
      retryable: true,
      details: { stage: "challenge-generate" },
    });
  }
  return {
    decrypt: runtime.api.dr.bind(runtime.api),
    proof: `${primary}::c2::${stage2}::c3::${bootstrap.r}`,
  };
}

function streamArgs(media, proof, providerId) {
  return [
    String(Number(media.tmdbId)),
    media.type === "tv" ? "show" : "movie",
    media.type === "tv" ? Number(media.season) : "$undefined",
    media.type === "tv" ? Number(media.episode) : "$undefined",
    proof,
    providerId,
  ];
}

function variantsFromEnvelope(envelope, providerId, providerRank = 0) {
  const variants = [];
  for (const candidate of envelope?.url ?? []) {
    if (typeof candidate?.url !== "string") continue;
    try {
      const target = assertCineSrcMediaUrl(candidate.url);
      const declared = String(candidate.source ?? "").toLowerCase();
      if (!declared.includes("hls") && !target.pathname.toLowerCase().includes("m3u8")) {
        continue;
      }
      const host = target.hostname.toLowerCase();
      variants.push({
        url: target.href,
        type: "hls",
        quality: candidate.label ?? candidate.source ?? null,
        failureDomain: cinesrcMediaFailureDomain(host),
        capacityDomains: cinesrcCapacityDomains(host),
        deliveryMode: "resolver-full-relay",
        provider: providerId,
        providerRank,
        audioLanguages: [],
        laneId: null,
      });
    } catch {
      continue;
    }
  }
  return variants;
}

function laneHash8(value) {
  let state = 0x811c9dc5;
  for (const character of String(value)) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 0x01000193);
  }
  return (state >>> 0).toString(16).padStart(8, "0");
}

// Opaque lane id: stable for a provider+url pair, reveals no upstream brand.
export function cinesrcLaneId(providerId, variantUrl, index) {
  return `lane-${laneHash8(`${providerId}\n${variantUrl}\n${index}`)}`;
}

export function estimateManifestQuality(manifest) {
  let bandwidth = 0;
  let height = 0;
  for (const line of String(manifest ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.toUpperCase().startsWith("#EXT-X-STREAM-INF")) continue;
    const bw = Number(/BANDWIDTH\s*=\s*(\d+)/i.exec(trimmed)?.[1]);
    if (Number.isFinite(bw) && bw > bandwidth) bandwidth = bw;
    const res = /RESOLUTION\s*=\s*\d+x(\d+)/i.exec(trimmed)?.[1];
    const parsed = Number(res);
    if (Number.isFinite(parsed) && parsed > height) height = parsed;
  }
  return { bandwidth, height };
}

function laneScore({ quality, latencyMs, providerRank }) {
  // Quality dominates, then latency, then the provider-index rank.
  return (
    (quality?.height ?? 0) * 1_000_000 +
    (quality?.bandwidth ?? 0) / 1_000 +
    providerRank * 10 -
    Math.min(latencyMs ?? 0, 20_000) / 100
  );
}

function subtitlesFromEnvelope(envelope) {
  const subtitles = [];
  for (const track of envelope?.captions ?? []) {
    const file = track?.url ?? track?.file;
    if (typeof file !== "string") continue;
    try {
      const url = assertCineSrcMediaUrl(file);
      subtitles.push({
        file: url.href,
        label: String(track?.label ?? track?.language ?? "Subtitles").slice(0, 100),
        lang: String(track?.language ?? track?.lang ?? "und").slice(0, 20),
        kind: "captions",
      });
    } catch {
      continue;
    }
  }
  return subtitles.slice(0, 100);
}

async function verifyVariant(context, variant, laneId, signal) {
  const startedAt = performance.now();
  const headers = {
    accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    referer: `${context.pageUrl.origin}/`,
    origin: context.pageUrl.origin,
    "user-agent": USER_AGENT,
  };
  const response = await context.fetchImpl(variant.url, {
    headers,
    redirect: "manual",
    signal,
  });
  if (!response.ok) {
    response.body?.cancel();
    return null;
  }
  const manifest = await limitedText(response, MAX_ACTION_BYTES, "media validation");
  if (!manifest.trimStart().startsWith("#EXTM3U")) return null;
  // Audio-language proof: keep the detected languages on the variant so the
  // router can prefer a lane that declares the requested language.
  const audioLanguages = hlsAudioLanguages(manifest);
  const quality = estimateManifestQuality(manifest);
  const verified = {
    ...variant,
    laneId,
    audioLanguages,
    manifestHeight: quality.height,
    manifestBandwidth: quality.bandwidth,
    verifyLatencyMs: Math.round(performance.now() - startedAt),
  };
  return context.browserOrigin
    ? proxyDiscoveredCineSrcCandidate(verified, context.browserOrigin)
    : verified;
}

async function resolveProviderLane(context, provider, laneIndex, signal) {
  const laneStartedAt = performance.now();
  const throwIfAborted = () => {
    if (context.signal?.aborted) {
      throw context.signal.reason ?? new Error("aborted");
    }
    if (signal?.aborted) {
      throw signal.reason ?? new Error("aborted");
    }
  };
  for (let attempt = 0; attempt < MAX_CHALLENGE_ATTEMPTS; attempt += 1) {
    throwIfAborted();
    const challenge = await challengeProof(
      context.fetchImpl,
      context.media,
      context.pageUrl,
      context.runtimeScripts,
      signal,
      context.runtimeFactory,
    );
    const action = await callAction(
      context.fetchImpl,
      context.pageUrl,
      context.contract.streamAction,
      streamArgs(context.media, challenge.proof, provider.id),
      signal,
      "stream action",
    );
    const cipher = parseCineSrcRscValue(action);
    if (cipher === "e1:invalid_challenge") continue;
    if (typeof cipher !== "string" || cipher.length > MAX_ACTION_BYTES) break;
    let envelope;
    try {
      envelope = await challenge.decrypt(cipher);
    } catch {
      break;
    }
    const candidates = variantsFromEnvelope(envelope, provider.id, provider.rank);
    if (candidates.length > 0) {
      const verified = [];
      const checks = await Promise.allSettled(
        candidates.slice(0, 3).map(async (variant, index) => {
          const laneId = cinesrcLaneId(provider.id, variant.url, laneIndex * 8 + index);
          const proof = await verifyVariant(
            context,
            { ...variant, laneId },
            laneId,
            signal,
          );
          if (!proof) return null;
          return proof;
        }),
      );
      for (const check of checks) {
        if (check.status === "fulfilled" && check.value) verified.push(check.value);
        throwIfAborted();
      }
      if (verified.length > 0) {
        const scored = verified.map((variant) => ({
          variant,
          score: laneScore({
            quality: {
              height: variant.manifestHeight ?? 0,
              bandwidth: variant.manifestBandwidth ?? 0,
            },
            latencyMs: variant.verifyLatencyMs ?? 0,
            providerRank: provider.rank,
          }),
        }));
        scored.sort((a, b) => b.score - a.score);
        return {
          providerId: provider.id,
          providerRank: provider.rank,
          laneId: scored[0].variant.laneId,
          variants: scored.map((entry) => entry.variant),
          subtitles: subtitlesFromEnvelope(envelope),
          latencyMs: Math.round(performance.now() - laneStartedAt),
          score: scored[0].score,
        };
      }
    }
    if (envelope?.error !== "invalid_challenge" && envelope?.error !== "missing_challenge") {
      break;
    }
  }
  return null;
}

function withLaneTimeout(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("lane timeout")), timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  };
  return { signal: controller.signal, cleanup };
}

// Race a bounded set of provider lanes in parallel, rank verified lanes by
// quality/latency, return the best first but keep the rest for failover.
export async function raceCineSrcLanes(context, providers, options = {}) {
  const lanes = providers.slice(0, options.maxLanes ?? CINESRC_MAX_RACE_LANES);
  const timeoutMs = options.laneTimeoutMs ?? CINESRC_LANE_TIMEOUT_MS;
  const attempts = [];
  const settled = await Promise.allSettled(
    lanes.map(async (provider, index) => {
      const lane = withLaneTimeout(context.signal, timeoutMs);
      try {
        debugEvent("route", "cinesrc.provider-attempt", { provider: provider.id });
        const resolved = await resolveProviderLane(context, provider, index, lane.signal);
        if (!resolved) {
          attempts.push({ provider: provider.id, outcome: "empty" });
          return null;
        }
        return resolved;
      } catch (error) {
        if (context.signal?.aborted) throw error;
        attempts.push({
          provider: provider.id,
          outcome: "error",
          stage: error?.details?.stage ?? null,
          status: error?.status ?? null,
        });
        return null;
      } finally {
        lane.cleanup();
      }
    }),
  );
  const verified = [];
  for (const entry of settled) {
    if (entry.status === "fulfilled" && entry.value) verified.push(entry.value);
    else if (entry.status === "rejected" && context.signal?.aborted) {
      throw entry.reason;
    }
  }
  verified.sort((a, b) => b.score - a.score || a.latencyMs - b.latencyMs);
  return { lanes: verified, attempts };
}

// Back-compat alias for the previous sequential resolver.
async function resolveProvider(context, provider) {
  const lane = await resolveProviderLane(context, provider, 0, context.signal);
  return lane ? { variants: lane.variants, subtitles: lane.subtitles } : null;
}

function cacheKey(media, origin) {
  return JSON.stringify([
    origin.origin,
    media.type,
    Number(media.tmdbId),
    media.type === "tv" ? Number(media.season) : null,
    media.type === "tv" ? Number(media.episode) : null,
  ]);
}

async function resolveCineSrcRemotely(media, options) {
  const url = new URL(options.resolverUrl ?? process.env.CINESRC_RESOLVER_URL);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const secret = options.resolverSecret ?? process.env.VIDEASY_RESOLVER_SECRET;
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.hash ||
      typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new CineSrcError("CineSrc resolver configuration is invalid", {
      status: 503, details: { stage: "resolver-config" },
    });
  }
  const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ media, fresh: options.fresh === true }),
    redirect: "manual",
    signal: options.signal,
  });
  let payload;
  try {
    payload = JSON.parse(await limitedText(response, MAX_ACTION_BYTES, "resolver-response"));
  } catch {
    throw new CineSrcError("CineSrc resolver returned invalid JSON", {
      retryable: true, details: { stage: "resolver-response" },
    });
  }
  if (!response.ok) {
    throw new CineSrcError("CineSrc remote resolution failed", {
      status: response.status,
      retryable: payload?.retryable !== false,
      retryAfterMs: Number(payload?.retryAfterMs) || null,
      details: { stage: "resolver-response", upstream: payload?.details ?? null },
    });
  }
  const variants = variantsFromEnvelope({ url: (Array.isArray(payload?.variants)
    ? payload.variants.slice(0, 50) : []).map(v => ({ url: v?.url, label: v?.quality })) }, "remote");
  if (!variants.length) {
    throw new CineSrcError("CineSrc resolver returned no valid streams", {
      retryable: true, details: { stage: "resolver-response" },
    });
  }
  return {
    variants: options.proxyOrigin
      ? variants.map(v => proxyDiscoveredCineSrcCandidate(v, options.proxyOrigin))
      : variants,
    subtitles: subtitlesFromEnvelope({ captions: Array.isArray(payload.subtitles) ? payload.subtitles : [] }),
    latencyMs: Number.isFinite(payload.latencyMs) ? Math.max(0, payload.latencyMs) : 0,
  };
}

export async function resolveCineSrc(media, options = {}) {
  assertMedia(media);
  if (options.remote !== false && (options.resolverUrl ?? process.env.CINESRC_RESOLVER_URL)) {
    return resolveCineSrcRemotely(media, options);
  }
  const origin = originUrl(options.origin ?? DEFAULT_ORIGIN);
  const key = cacheKey(media, origin);
  const cached = CACHE.get(key);
  if (!options.fresh && cached?.expiresAt > Date.now()) {
    return { ...cached.value, latencyMs: 0 };
  }
  if (cached) CACHE.delete(key);
  const startedAt = performance.now();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const pageUrl = pageUrlFor(media, origin);
  debugEvent("route", "cinesrc.stage", { stage: "contract-discovery" });
  const contract = await discoverContract(fetchImpl, pageUrl, options.signal);
  const providerPayload = await callAction(
    fetchImpl,
    pageUrl,
    contract.providerListAction,
    [],
    options.signal,
    "provider index",
  );
  const providers = normalizeCineSrcProviders(parseCineSrcRscValue(providerPayload));
  if (providers.length === 0) {
    throw new CineSrcError("CineSrc returned no usable providers", {
      retryable: true,
      details: { stage: "provider-index" },
    });
  }
  const scripts = await runtimeSources(fetchImpl, contract, origin, options.signal);
  const context = {
    browserOrigin: options.proxyOrigin
      ? new URL(options.proxyOrigin).origin
      : null,
    contract,
    fetchImpl,
    media,
    pageUrl,
    runtimeFactory: options.runtimeFactory ?? evaluateCineSrcScripts,
    runtimeScripts: scripts,
    signal: options.signal,
  };
  const { lanes, attempts } = await raceCineSrcLanes(context, providers, {
    maxLanes: options.maxLanes ?? CINESRC_MAX_RACE_LANES,
    laneTimeoutMs: options.laneTimeoutMs ?? CINESRC_LANE_TIMEOUT_MS,
  });
  if (lanes.length === 0) {
    throw new CineSrcError("CineSrc providers returned no playable stream", {
      retryable: true,
      details: { stage: "provider-fallback", attempts },
    });
  }
  const [best, ...rest] = lanes;
  const variants = lanes.flatMap((lane) => lane.variants);
  const result = {
    variants,
    subtitles: best.subtitles,
    latencyMs: Math.round(performance.now() - startedAt),
    laneId: best.laneId,
    lanes: lanes.map((lane) => ({
      laneId: lane.laneId,
      provider: lane.providerId,
      latencyMs: lane.latencyMs,
      variants: lane.variants.length,
    })),
    alternates: rest.flatMap((lane) =>
      lane.variants.map((variant) => ({
        laneId: lane.laneId,
        provider: lane.providerId,
        url: variant.url,
      })),
    ),
  };
  CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}

export function createCineSrcResolver(id) {
  return async (media, options = {}) => {
    const result = await resolveCineSrc(media, options);
    return {
      candidates: normalizeVariants(result.variants, id),
      subtitles: result.subtitles,
      latencyMs: result.latencyMs,
      alternates: (result.alternates ?? []).slice(0, 8).map((entry) => ({
        classification: "proxy",
        reason: `lane:${entry.laneId ?? "unknown"}`,
      })),
    };
  };
}
