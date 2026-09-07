import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { resolveVideasy, VideasyError } from "./providers/videasy.mjs";
import {
  assertDiscoveredVideasyRelayUrl,
  assertWrapperMediaUrl,
} from "./providers/wrapper-media-proxy.mjs";

import { resolveCineSrc, CineSrcError } from "./providers/cinesrc.mjs";

const MAX_REQUEST_BYTES = 16 * 1024;
const RESOLUTION_TIMEOUT_MS = 22_000;
const MEDIA_TIMEOUT_MS = 60_000;
const port = Number(process.env.PORT ?? 8787);

function configuredSecret() {
  const secretFile = process.env.PHANTOM_RESOLVER_SECRET_FILE;
  const value = secretFile
    ? readFileSync(secretFile, "utf8").trim()
    : String(process.env.PHANTOM_RESOLVER_SECRET ?? "");
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("PHANTOM_RESOLVER_SECRET must contain at least 32 bytes");
  }
  return value;
}

const secretHash = createHash("sha256").update(configuredSecret()).digest();

function authorized(request) {
  const header = String(request.headers.authorization ?? "");
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(providedHash, secretHash);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new RangeError("Request body exceeded the size limit");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicResult(result) {
  return {
    variants: result.variants.map((variant) => ({
      url: variant.url,
      quality: variant.quality,
    })),
    subtitles: result.subtitles,
    latencyMs: result.latencyMs,
  };
}

function relayTarget(request) {
  const encoded = String(request.headers["x-phantom-target"] ?? "");
  if (!/^[A-Za-z0-9_-]{24,16000}$/.test(encoded)) {
    throw new TypeError("Media target is invalid");
  }
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  try {
    return assertWrapperMediaUrl(decoded);
  } catch {
    return assertDiscoveredVideasyRelayUrl(decoded);
  }
}

function mediaRequestHeaders(request) {
  const headers = new Headers({
    accept: String(request.headers.accept ?? "*/*").slice(0, 512),
    origin: "https://player.videasy.to",
    referer: "https://player.videasy.to/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/138.0.0.0 Safari/537.36",
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers[`x-phantom-${name}`];
    if (typeof value === "string" && value.length <= 512) {
      headers.set(name, value);
    }
  }
  return headers;
}

function mediaResponseHeaders(upstream) {
  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function relayMedia(request, response) {
  const target = relayTarget(request);
  const method = request.headers["x-phantom-upstream-method"] === "HEAD"
    ? "HEAD"
    : "GET";
  const upstream = await fetch(target, {
    method,
    headers: mediaRequestHeaders(request),
    redirect: "manual",
    signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel();
    return sendJson(response, 502, { error: "Media redirect refused" });
  }
  response.writeHead(upstream.status, mediaResponseHeaders(upstream));
  if (method === "HEAD" || !upstream.body) return response.end();
  Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://resolver.internal");
  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/v1/fetch") {
    if (!authorized(request)) {
      return sendJson(response, 401, { error: "Unauthorized" });
    }
    try {
      return await relayMedia(request, response);
    } catch (error) {
      const status = error instanceof TypeError ? 400 : 502;
      return sendJson(response, status, { error: "Media relay failed" });
    }
  }
  if (request.method !== "POST" || !["/v1/resolve", "/v1/cinesrc/resolve"].includes(url.pathname)) {
    return sendJson(response, 404, { error: "Not found" });
  }
  if (!authorized(request)) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }
  if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
    return sendJson(response, 415, { error: "JSON request required" });
  }

  try {
    const body = await readJson(request);
    const resolve = url.pathname === "/v1/cinesrc/resolve" ? resolveCineSrc : resolveVideasy;
    const result = await resolve(body?.media, {
      fresh: body?.fresh === true,
      remote: false,
      signal: AbortSignal.timeout(RESOLUTION_TIMEOUT_MS),
    });
    return sendJson(response, 200, publicResult(result));
  } catch (error) {
    const known = error instanceof VideasyError || error instanceof CineSrcError;
    const timeout = error?.name === "TimeoutError";
    const status =
      error instanceof RangeError
        ? 413
        : error instanceof SyntaxError || error instanceof TypeError
          ? 400
          : known && Number(error.status) >= 400
            ? Number(error.status)
            : timeout
              ? 504
              : 502;
    return sendJson(response, status, {
      error: known ? error.message : timeout ? "Resolution timed out" : "Resolution failed",
      retryable: timeout || (known && error.retryable),
      retryAfterMs: known ? error.retryAfterMs : null,
      details: known ? error.details : null,
    });
  }
});

server.requestTimeout = 25_000;
server.headersTimeout = 10_000;
server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "resolver.started", port }));
});
