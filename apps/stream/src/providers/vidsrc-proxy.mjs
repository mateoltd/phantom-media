import { Buffer } from "node:buffer";

export const VIDSRC_PROXY_PATH = "/api/sources/vidsrc/proxy";

const DEFAULT_MEDIA_HOSTS = Object.freeze([
  "verdantvagary.website",
  "peregrinepalaver.space",
  "scintillatingsycophant.space",
  "kinesiskaleidoscope.website",
  "loquaciouslexicon.website",
  "metonymicmosaic.website",
  "demesnedialectic.website",
  "xoanonymorpha.site",
  "jejunejamboree.website",
  "xeriscapexanadu.site",
]);
const MEDIA_PATHS = Object.freeze(["/pl/", "/content/"]);
const TOKEN = /^[A-Za-z0-9._~-]{20,4096}$/;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

function configuredHosts() {
  return String(process.env.VIDSRC_MEDIA_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function vidsrcMediaHosts(extra = []) {
  return new Set(
    [...DEFAULT_MEDIA_HOSTS, ...configuredHosts(), ...extra].map((host) =>
      String(host).toLowerCase(),
    ),
  );
}

export function assertVidsrcMediaUrl(input, allowedHosts = vidsrcMediaHosts()) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("VidSrc media target is not a valid URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new TypeError("VidSrc media target is not allowed");
  }
  if (!MEDIA_PATHS.some((prefix) => url.pathname.startsWith(prefix))) {
    throw new TypeError("VidSrc media path is not allowed");
  }
  if (
    [...url.searchParams.keys()].some((key) => key !== "token") ||
    !TOKEN.test(url.searchParams.get("token") ?? "")
  ) {
    throw new TypeError("VidSrc media token is invalid");
  }
  url.hash = "";
  return url;
}

export function encodeVidsrcProxyTarget(
  upstream,
  proxyOrigin,
  allowedHosts = vidsrcMediaHosts(),
) {
  const target = assertVidsrcMediaUrl(upstream, allowedHosts);
  const base = new URL(proxyOrigin);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError("VidSrc proxy origin must be HTTP or HTTPS");
  }
  const url = new URL(VIDSRC_PROXY_PATH, base);
  url.searchParams.set(
    "target",
    Buffer.from(target.href, "utf8").toString("base64url"),
  );
  return url.href;
}

export function decodeVidsrcProxyTarget(
  encoded,
  allowedHosts = vidsrcMediaHosts(),
) {
  if (!/^[A-Za-z0-9_-]{24,8192}$/.test(String(encoded ?? ""))) {
    throw new TypeError("VidSrc proxy target is invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    throw new TypeError("VidSrc proxy target is invalid");
  }
  return assertVidsrcMediaUrl(decoded, allowedHosts);
}

function proxiedUri(value, upstream, proxyOrigin, allowedHosts) {
  const absolute = new URL(value, upstream);
  return encodeVidsrcProxyTarget(absolute, proxyOrigin, allowedHosts);
}

function assertSupportedHlsEncryption(line) {
  if (!/^#EXT-X-(?:SESSION-)?KEY:/i.test(line)) return;

  const method = line.match(/\bMETHOD=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i);
  const keyFormat = line.match(
    /\bKEYFORMAT=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i,
  );
  const methodValue = (method?.[1] ?? method?.[2] ?? method?.[3] ?? "")
    .trim()
    .toUpperCase();
  const keyFormatValue = (
    keyFormat?.[1] ??
    keyFormat?.[2] ??
    keyFormat?.[3] ??
    "identity"
  )
    .trim()
    .toLowerCase();

  if (
    methodValue &&
    methodValue !== "NONE" &&
    (methodValue !== "AES-128" || keyFormatValue !== "identity")
  ) {
    throw new TypeError("VidSrc DRM-protected HLS is not supported");
  }
}

export function rewriteVidsrcHls(
  manifest,
  upstream,
  proxyOrigin,
  allowedHosts = vidsrcMediaHosts(),
) {
  const source = assertVidsrcMediaUrl(upstream, allowedHosts);
  return String(manifest)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith("#")) {
        return proxiedUri(trimmed, source, proxyOrigin, allowedHosts);
      }
      assertSupportedHlsEncryption(trimmed);
      return line.replace(/\bURI=(["'])(.*?)\1/g, (_match, quote, value) => {
        const rewritten = proxiedUri(
          value,
          source,
          proxyOrigin,
          allowedHosts,
        );
        return `URI=${quote}${rewritten}${quote}`;
      });
    })
    .join("\n");
}

async function limitedText(response, limit = MAX_MANIFEST_BYTES) {
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
        throw new RangeError("VidSrc manifest exceeded the size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function upstreamHeaders(request) {
  const headers = new Headers({
    accept:
      request.headers.get("accept") ??
      "application/vnd.apple.mpegurl,video/mp2t,*/*",
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(upstream, manifest = false) {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-expose-headers":
      "accept-ranges,content-length,content-range,content-type",
    "cache-control": "private, no-store",
    "cross-origin-resource-policy": "cross-origin",
    vary: "range",
  });
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (manifest) {
    headers.set("content-type", "application/vnd.apple.mpegurl; charset=utf-8");
    headers.delete("content-length");
    headers.delete("content-range");
  }
  return headers;
}

function isManifest(url, response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    url.pathname.endsWith(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("m3u")
  );
}

async function fetchUpstream(fetchImpl, target, request) {
  return fetchImpl(target, {
    method: request.method,
    headers: upstreamHeaders(request),
    redirect: "manual",
    signal: request.signal,
  });
}

async function refreshMediaToken(fetchImpl, target, request) {
  const endpoint = new URL("/generate.php", target);
  const response = await fetchImpl(endpoint, {
    headers: { accept: "text/plain" },
    redirect: "manual",
    signal: request.signal,
  });
  if (!response.ok) {
    response.body?.cancel();
    return null;
  }
  const token = (await limitedText(response, 8 * 1024)).trim();
  return TOKEN.test(token) ? token : null;
}

export async function proxyVidsrcRequest(request, options = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const allowedHosts =
    options.allowedHosts ?? vidsrcMediaHosts(options.extraHosts);
  let target;
  try {
    const encoded = new URL(request.url).searchParams.get("target");
    target = decodeVidsrcProxyTarget(encoded, allowedHosts);
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let upstream;
  try {
    upstream = await fetchUpstream(fetchImpl, target, request);
    if (
      request.method === "GET" &&
      (upstream.status === 401 || upstream.status === 403)
    ) {
      upstream.body?.cancel();
      const token = await refreshMediaToken(fetchImpl, target, request);
      if (token) {
        target.searchParams.set("token", token);
        upstream = await fetchUpstream(fetchImpl, target, request);
      }
    }
  } catch {
    return new Response("VidSrc media request failed", { status: 502 });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel();
    return new Response("VidSrc media redirect was refused", { status: 502 });
  }

  const manifest = request.method === "GET" && isManifest(target, upstream);
  if (!manifest) {
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  }

  let body;
  try {
    body = await limitedText(upstream);
  } catch (error) {
    upstream.body?.cancel();
    return new Response(error.message, { status: 502 });
  }

  let rewritten = body;
  if (upstream.ok) {
    try {
      rewritten = rewriteVidsrcHls(
        body,
        target,
        new URL(request.url).origin,
        allowedHosts,
      );
    } catch {
      return new Response("VidSrc manifest contained an unsafe URI", {
        status: 502,
      });
    }
  }
  return new Response(rewritten, {
    status: upstream.status,
    headers: responseHeaders(upstream, true),
  });
}
