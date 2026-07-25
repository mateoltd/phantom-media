import { NextRequest, NextResponse } from "next/server";
import { SUBTITLE_FILE_HOST_SUFFIX } from "@/lib/subtitles";
import { toWebVtt } from "@/src/subtitles.mjs";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 8_000;

/** A feature-length subtitle file is tens of kilobytes. This is generous. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Files are keyed by an immutable upstream id, so they never change. */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

/**
 * Only the catalogue's own file hosts. Without this, an endpoint that fetches
 * a URL from a query string and returns the body is an open proxy — anything
 * on the internal network the worker can reach becomes readable through it,
 * and the worker's address is the one doing the asking.
 *
 * Note the leading dot: matching a suffix without it would also match
 * `notstrem.io`.
 */
function allowed(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return (
    url.hostname === SUBTITLE_FILE_HOST_SUFFIX.slice(1) ||
    url.hostname.endsWith(SUBTITLE_FILE_HOST_SUFFIX)
  );
}

/**
 * Files predating anyone using UTF-8 carry their encoding as a label upstream.
 * Decoding a Windows-1253 file as UTF-8 turns every Greek subtitle into
 * replacement characters, so it is worth the attempt — but not worth failing
 * over when a runtime does not carry the legacy tables.
 */
function decode(bytes: ArrayBuffer, encoding: string | null): string {
  if (encoding) {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      // Not a label this runtime knows.
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const encoding = request.nextUrl.searchParams.get("encoding");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "A subtitle address is required" }, { status: 400 });
  }
  if (!allowed(target)) {
    return NextResponse.json(
      { error: "That subtitle host is not served here" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(target, {
      headers: { accept: "text/vtt, text/plain, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `The subtitle host returned HTTP ${response.status}` },
        { status: 502 },
      );
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return NextResponse.json({ error: "That subtitle file is too large" }, { status: 502 });
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "That subtitle file is too large" }, { status: 502 });
    }

    // Whatever it was, it leaves here as WebVTT from this origin, which is the
    // only combination a track element on a cross-origin video will load.
    return new NextResponse(toWebVtt(decode(bytes, encoding)), {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "cache-control": CACHE_CONTROL,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The subtitle host did not answer" },
      { status: 504 },
    );
  }
}
