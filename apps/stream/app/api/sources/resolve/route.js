import { NextResponse } from "next/server";
import { getProvider } from "../../../../src/providers/registry.mjs";
import { RelayError } from "../../../../src/relay-client.mjs";
import { formatEntry, sharedLog } from "../../../../src/debug.mjs";

// `STREAM_DEBUG=1` puts the server's half of the record on stdout. The browser
// can ask for timings per request without it; this is for the case where the
// question is about the isolate rather than about one race.
if (process.env.STREAM_DEBUG) {
  sharedLog().setSink((entry) => {
    console.log(`[stream] ${formatEntry(entry)}`);
  });
}

// The relay decrypts upstream payloads with node:crypto.
export const runtime = "nodejs";

/**
 * Longer than the router's own patience, so the isolate always outlives the
 * client giving up rather than racing it. Without a ceiling here, an upstream
 * that never answers holds a subrequest open for as long as it likes.
 */
const DEADLINE_MS = 8_500;

/** Set by the browser when its log is running; answered with timings. */
const DEBUG_HEADER = "x-phantom-debug";

function timing(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}

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

  // The browser asks for timings when its own log is running. They are the
  // only way to tell an upstream that is slow from a route that is queued
  // behind something else, and the difference decides what to fix.
  const wantsTiming = request.headers.get(DEBUG_HEADER) === "1";
  const log = sharedLog();
  if (wantsTiming) log.setEnabled(true);
  const startedAt = Date.now();

  try {
    const result = await provider.resolve(readMedia(params), {
      signal: deadlineSignal(request),
      // Distinct from the merged signal above: this one aborting means the
      // caller left, which must not be recorded as the source failing.
      abandoned: request.signal,
    });
    const headers = { "cache-control": "no-store" };
    if (wantsTiming) {
      headers[DEBUG_HEADER] = timing({
        route: Date.now() - startedAt,
        upstream: result.latencyMs,
        candidates: result.candidates.length,
        subtitles: result.subtitles.length,
      });
    }
    return NextResponse.json(
      {
        server: provider.id,
        serverLabel: provider.label,
        latencyMs: result.latencyMs,
        candidates: result.candidates,
        subtitles: result.subtitles,
      },
      { headers },
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

    log.event("route", "failed", {
      source: provider.label,
      status,
      ms: Date.now() - startedAt,
      abandoned: Boolean(known && error.abandoned),
      message: error?.message,
    });

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
