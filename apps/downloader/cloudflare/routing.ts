const PAGE_PATHS = new Set([
  "/",
  "/disclaimer",
  "/es",
  "/es/disclaimer",
  "/es/playlist",
  "/es/search",
  "/es/watch",
  "/playlist",
  "/search",
  "/watch",
]);

const PUBLIC_ASSET_PATHS = new Set([
  "/apple-icon.png",
  "/brush-stroke.png",
  "/favicon.ico",
  "/icon.png",
  "/manifest.webmanifest",
  "/og.png",
  "/phantom-mark-v2.png",
  "/robots.txt",
  "/sitemap.xml",
]);

const NEXT_IMAGE_WIDTHS = new Set([
  "32",
  "48",
  "64",
  "96",
  "128",
  "256",
  "384",
  "640",
  "750",
  "828",
  "1080",
  "1200",
  "1920",
  "2048",
  "3840",
]);

const DOWNLOAD_JOB_PATTERN =
  "\\/api\\/download\\/jobs\\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const DOWNLOAD_JOB_PATH = new RegExp(`^${DOWNLOAD_JOB_PATTERN}$`, "i");
const DOWNLOAD_FILE_PATH = new RegExp(`^${DOWNLOAD_JOB_PATTERN}/file$`, "i");

export type RouteDecision =
  | { kind: "container" }
  | { kind: "frontend"; request: Request }
  | { kind: "health" }
  | { kind: "method_not_allowed"; allow: string }
  | { kind: "not_found" }
  | { kind: "redirect"; location: string };

export function routeRequest(request: Request): RouteDecision {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  const redirect = routeRedirect(url, method);
  if (redirect) return redirect;

  if (pathname === "/api/health") {
    return isReadMethod(method)
      ? { kind: "health" }
      : { kind: "method_not_allowed", allow: "GET, HEAD" };
  }

  const apiDecision = routeApi(pathname, method);
  if (apiDecision) return apiDecision;

  if (pathname.startsWith("/api/")) return { kind: "not_found" };

  if (!isReadMethod(method)) {
    return isKnownFrontendPath(pathname)
      ? { kind: "method_not_allowed", allow: "GET, HEAD" }
      : { kind: "not_found" };
  }

  if (PAGE_PATHS.has(pathname)) {
    // RSC responses vary by router-state headers. Keep them out of the shared
    // URL cache until the frontend is fully separated from the container.
    if (
      request.headers.has("RSC") ||
      request.headers.has("Next-Router-State-Tree")
    ) {
      return { kind: "container" };
    }

    return { kind: "frontend", request: canonicalRequest(request, pathname) };
  }

  if (
    PUBLIC_ASSET_PATHS.has(pathname) ||
    pathname.startsWith("/_next/static/")
  ) {
    return { kind: "frontend", request: canonicalRequest(request, pathname) };
  }

  if (pathname === "/_next/image") {
    const canonicalImageUrl = canonicalizeNextImage(url);
    return canonicalImageUrl
      ? { kind: "frontend", request: new Request(canonicalImageUrl, request) }
      : { kind: "not_found" };
  }

  return { kind: "not_found" };
}

function routeApi(pathname: string, method: string): RouteDecision | null {
  if (
    pathname === "/api/search" ||
    pathname === "/api/resolve" ||
    pathname === "/api/streams" ||
    pathname === "/api/download/jobs"
  ) {
    return method === "POST"
      ? { kind: "container" }
      : { kind: "method_not_allowed", allow: "POST" };
  }

  if (DOWNLOAD_JOB_PATH.test(pathname)) {
    return method === "GET" || method === "DELETE"
      ? { kind: "container" }
      : { kind: "method_not_allowed", allow: "GET, DELETE" };
  }

  if (DOWNLOAD_FILE_PATH.test(pathname)) {
    return isReadMethod(method)
      ? { kind: "container" }
      : { kind: "method_not_allowed", allow: "GET, HEAD" };
  }

  return null;
}

function routeRedirect(url: URL, method: string): RouteDecision | null {
  if (!isReadMethod(method)) return null;

  const resultPath =
    url.pathname === "/results" || url.pathname === "/es/results";
  if (resultPath) {
    const destination = new URL(url.origin);
    destination.pathname = url.pathname.startsWith("/es/")
      ? "/es/search"
      : "/search";
    const query = url.searchParams.get("search_query");
    if (query) destination.searchParams.set("q", query);
    return {
      kind: "redirect",
      location: destination.pathname + destination.search,
    };
  }

  if (url.pathname.endsWith("/") && url.pathname !== "/") {
    const withoutSlash = url.pathname.slice(0, -1);
    if (
      PAGE_PATHS.has(withoutSlash) ||
      withoutSlash === "/results" ||
      withoutSlash === "/es/results"
    ) {
      return {
        kind: "redirect",
        location: withoutSlash + url.search,
      };
    }
  }

  return null;
}

function canonicalizeNextImage(url: URL): URL | null {
  const allowedParameters = new Set(["url", "w", "q"]);
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key) || url.searchParams.getAll(key).length !== 1) {
      return null;
    }
  }

  const source = url.searchParams.get("url");
  const width = url.searchParams.get("w");
  const quality = url.searchParams.get("q");
  if (!source || !width || !NEXT_IMAGE_WIDTHS.has(width)) return null;
  if (quality !== null && quality !== "75") return null;
  if (!PUBLIC_ASSET_PATHS.has(source) && !source.startsWith("/_next/static/")) {
    return null;
  }

  const canonical = new URL(url.origin);
  canonical.pathname = "/_next/image";
  canonical.searchParams.set("url", source);
  canonical.searchParams.set("w", width);
  if (quality) canonical.searchParams.set("q", quality);
  return canonical;
}

function canonicalRequest(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return new Request(url, request);
}

function isKnownFrontendPath(pathname: string): boolean {
  return (
    PAGE_PATHS.has(pathname) ||
    PUBLIC_ASSET_PATHS.has(pathname) ||
    pathname === "/_next/image" ||
    pathname.startsWith("/_next/static/")
  );
}

function isReadMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}
