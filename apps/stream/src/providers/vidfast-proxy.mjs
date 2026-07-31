import { Buffer } from "node:buffer";

export const VIDFAST_PROXY_PATH = "/api/sources/vidfast/proxy";

const VIDFAST_ORIGIN = "https://vidfast.vc";
const DEFAULT_MEDIA_HOSTS = Object.freeze([
  "moon.ironwallnet.net",
  "diskphone12.site",
  "sandstorm13.site",
]);
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

function configuredHosts() {
  return String(process.env.VIDFAST_MEDIA_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function publicHostname(host) {
  return (
    host.includes(".") &&
    host !== "localhost" &&
    !host.endsWith(".localhost") &&
    !host.endsWith(".local") &&
    !/^\d+(?:\.\d+){3}$/.test(host) &&
    !host.includes(":")
  );
}

function rotatingSegmentUrl(url) {
  return (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.site$/.test(
      url.hostname.toLowerCase(),
    ) &&
    !url.search &&
    /^\/(?:r2\/cdn2|vd)\/[A-Za-z0-9_-]{64,}(?:\/[A-Za-z0-9._~-]{1,256})*$/.test(
      url.pathname,
    )
  );
}

export function vidfastMediaHosts(extra = []) {
  return new Set(
    [...DEFAULT_MEDIA_HOSTS, ...configuredHosts(), ...extra]
      .map((host) => String(host).trim().toLowerCase())
      .filter(publicHostname),
  );
}

export function assertVidfastMediaUrl(
  input,
  allowedHosts = vidfastMediaHosts(),
) {
  let url;
  try {
    url = input instanceof URL ? new URL(input) : new URL(String(input));
  } catch {
    throw new TypeError("Vidfast media target is not a valid URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (!allowedHosts.has(url.hostname.toLowerCase()) &&
      !rotatingSegmentUrl(url)) ||
    url.pathname === "/"
  ) {
    throw new TypeError("Vidfast media target is not allowed");
  }
  url.hash = "";
  return url;
}

export function encodeVidfastProxyTarget(
  upstream,
  proxyOrigin,
  allowedHosts = vidfastMediaHosts(),
) {
  const target = assertVidfastMediaUrl(upstream, allowedHosts);
  const base = new URL(proxyOrigin);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError("Vidfast proxy origin must be HTTP or HTTPS");
  }
  const url = new URL(VIDFAST_PROXY_PATH, base);
  url.searchParams.set(
    "target",
    Buffer.from(target.href, "utf8").toString("base64url"),
  );
  return url.href;
}

export function decodeVidfastProxyTarget(
  encoded,
  allowedHosts = vidfastMediaHosts(),
) {
  if (!/^[A-Za-z0-9_-]{20,16000}$/.test(String(encoded ?? ""))) {
    throw new TypeError("Vidfast proxy target is invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    throw new TypeError("Vidfast proxy target is invalid");
  }
  return assertVidfastMediaUrl(decoded, allowedHosts);
}

function proxiedUri(value, upstream, proxyOrigin, allowedHosts) {
  return encodeVidfastProxyTarget(
    new URL(value, upstream),
    proxyOrigin,
    allowedHosts,
  );
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
    throw new TypeError("Vidfast DRM-protected HLS is not supported");
  }
}

export function rewriteVidfastHls(
  manifest,
  upstream,
  proxyOrigin,
  allowedHosts = vidfastMediaHosts(),
) {
  const source = assertVidfastMediaUrl(upstream, allowedHosts);
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

async function limitedText(response) {
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
      if (size > MAX_MANIFEST_BYTES) {
        throw new RangeError("Vidfast manifest exceeded the size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function upstreamHeaders(request, origin) {
  const headers = new Headers({
    accept:
      request.headers.get("accept") ??
      "application/vnd.apple.mpegurl,video/mp2t,text/vtt,*/*",
    origin,
    referer: `${origin}/`,
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
    url.pathname.toLowerCase().endsWith(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("m3u")
  );
}

export async function proxyVidfastRequest(request, options = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }
  const allowedHosts =
    options.allowedHosts ?? vidfastMediaHosts(options.extraHosts);
  let target;
  try {
    const encoded = new URL(request.url).searchParams.get("target");
    target = decodeVidfastProxyTarget(encoded, allowedHosts);
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }

  let upstream;
  try {
    upstream = await (options.fetchImpl ?? globalThis.fetch)(target, {
      method: request.method,
      headers: upstreamHeaders(
        request,
        options.vidfastOrigin ?? VIDFAST_ORIGIN,
      ),
      redirect: "manual",
      signal: request.signal,
    });
  } catch {
    return new Response("Vidfast media request failed", { status: 502 });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel();
    return new Response("Vidfast media redirect was refused", { status: 502 });
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
      rewritten = rewriteVidfastHls(
        body,
        target,
        new URL(request.url).origin,
        allowedHosts,
      );
    } catch {
      return new Response("Vidfast manifest contained an unsafe URI", {
        status: 502,
      });
    }
  }
  return new Response(rewritten, {
    status: upstream.status,
    headers: responseHeaders(upstream, true),
  });
}
