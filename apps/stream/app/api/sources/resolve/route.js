import { NextResponse } from "next/server";
import { getProvider } from "../../../../src/providers/registry.mjs";
import { RelayError } from "../../../../src/relay-client.mjs";

// The relay decrypts upstream payloads with node:crypto.
export const runtime = "nodejs";

/**
 * Longer than the router's own patience, so the isolate always outlives the
 * client giving up rather than racing it. Without a ceiling here, an upstream
 * that never answers holds a subrequest open for as long as it likes.
 */
const DEADLINE_MS = 8_500;

/**
 * Combines the browser hanging up with our own ceiling. The first matters as
 * much as the second: the router aborts every sibling request the moment one
 * source wins, and that abort should reach upstream rather than stopping at
 * this worker.
 */
function deadlineSignal(request) {
  const timeout = AbortSignal.timeout(DEADLINE_MS);
  return request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
}

function readMedia(params) {
  const type = params.get("type");
  const media = {
    type,
    tmdbId: Number(params.get("tmdbId")),
    title: (params.get("title") ?? "").slice(0, 300),
    year: (params.get("year") ?? "").slice(0, 10),
  };
  const imdbId = params.get("imdbId") ?? "";
  if (/^tt\d{5,12}$/i.test(imdbId)) media.imdbId = imdbId.toLowerCase();
  if (type === "tv") {
    media.season = Number(params.get("season"));
    media.episode = Number(params.get("episode"));
  }
  return media;
}

function failure(status, body, retryAfterMs) {
  return NextResponse.json(body, {
    status,
    headers:
      retryAfterMs && retryAfterMs > 0
        ? { "retry-after": String(Math.ceil(retryAfterMs / 1_000)) }
        : undefined,
  });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const requested = params.get("server") ?? "";

  // Routing is the client's job now: it is the only side that knows what it
  // has already tried, how fast each source answered, and what it settled on
  // last time. Picking one here would be guessing over the top of that.
  const provider = requested ? getProvider(requested) : null;
  if (!provider) {
    return failure(400, {
      error: requested
        ? `Unknown source "${requested}"`
        : "A source must be named",
      retryable: false,
      retryAfterMs: null,
      server: null,
      details: null,
    });
  }

  try {
    const result = await provider.resolve(readMedia(params), {
      signal: deadlineSignal(request),
    });
    return NextResponse.json(
      {
        server: provider.id,
        serverLabel: provider.label,
        latencyMs: result.latencyMs,
        candidates: result.candidates,
        subtitles: result.subtitles,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // A malformed request is the caller's mistake, not upstream's, and
    // retrying it would fail exactly the same way.
    if (error instanceof TypeError) {
      return failure(400, {
        error: error.message,
        retryable: false,
        retryAfterMs: null,
        server: provider.id,
        details: null,
      });
    }

    const known = error instanceof RelayError;
    const aborted = error?.name === "AbortError" || error?.name === "TimeoutError";
    const status = known && error.status >= 400 ? error.status : aborted ? 504 : 502;
    const retryAfterMs = known ? error.retryAfterMs : null;

    return failure(
      status,
      {
        error: aborted
          ? `${provider.label} did not answer in time`
          : error.message,
        retryable: known ? error.retryable : aborted,
        retryAfterMs,
        server: provider.id,
        details: known ? error.details : null,
      },
      retryAfterMs,
    );
  }
}
