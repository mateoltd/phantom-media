import { NextRequest, NextResponse } from "next/server";
import { SUBTITLE_FILE_HOST_SUFFIX } from "@/lib/subtitles";
import { toWebVtt } from "@/src/subtitles.mjs";
import { subdlFileUrl } from "@/src/subdl.mjs";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 8_000;

const MAX_BYTES = 4 * 1024 * 1024;

const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

function allowed(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.hostname === "dl.subdl.com") return subdlFileUrl(url.href) === url.href;
  // The leading dot prevents hosts such as notstrem.io from matching the suffix.
  return (
    url.hostname === SUBTITLE_FILE_HOST_SUFFIX.slice(1) ||
    url.hostname.endsWith(SUBTITLE_FILE_HOST_SUFFIX)
  );
}

function decode(bytes: ArrayBuffer, encoding: string | null): string {
  if (encoding) {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
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
      // Workers supports manual/follow only. Non-2xx responses below also
      // reject redirects, so a subtitle URL cannot redirect outside the allowlist.
      redirect: "manual",
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

    return new NextResponse(toWebVtt(decode(bytes, encoding)), {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "cache-control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "The subtitle host did not answer" : "The subtitle download failed" },
      { status: timedOut ? 504 : 502 },
    );
  }
}
