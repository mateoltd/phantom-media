import "../server-boundary.ts";
const HOSTS = [
  /^[a-z0-9-]+\.twitch\.tv$/,
  /^[a-z0-9-]+\.ttvnw\.net$/,
  /^[a-z0-9-]+\.playlist\.ttvnw\.net$/,
  /^(?:[a-z0-9-]+\.)+hls\.ttvnw\.net$/,
  /^[a-z0-9]+\.cloudfront\.net$/,
  /^static-cdn\.jtvnw\.net$/,
];

export function mediaDestination(value: string | URL): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !HOSTS.some(host => host.test(url.hostname)) ||
      !/\.(?:m3u8|ts|m4s|mp4|jpg|jpeg|png|webp|gif|json|vtt)$/i.test(url.pathname)) {
    throw new Error("Invalid media destination");
  }
  return url;
}

/** Validate every redirect, including before transmitting range/validator headers. */
export async function fetchMedia(value: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = mediaDestination(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { ...init, cache: "no-store", redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get("Location");
    if (!location || redirects === 3) throw new Error("Invalid media redirect");
    url = mediaDestination(new URL(location, url));
  }
  throw new Error("Too many redirects");
}
