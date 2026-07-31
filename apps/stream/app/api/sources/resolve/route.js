import { NextResponse } from "next/server";
import { getProvider } from "../../../../src/providers/registry.mjs";
import { RelayError } from "../../../../src/relay-client.mjs";
import { sharedLog } from "../../../../src/debug.mjs";
import {
  installServerDebugSink,
  normalizeTraceId,
  withServerDebugTrace,
} from "../../../../src/debug-server.mjs";

export const runtime = "nodejs";

const DEADLINE_MS = 12_000;

const DEBUG_HEADER = "x-phantom-debug";
const TRACE_HEADER = "x-phantom-trace-id";

installServerDebugSink();

function timing(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}

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
    audioLanguage: (params.get("audioLanguage") ?? "und").slice(0, 35),
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

function timedOut(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (
      current.name === "TimeoutError" ||
      /(?:timed? ?out|timeout|aborted due to timeout)/i.test(
        current.message ?? "",
      )
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export async function GET(request) {
  const traceId = normalizeTraceId(request.headers.get(TRACE_HEADER));
  return withServerDebugTrace(traceId, async () => {
    const params = new URL(request.url).searchParams;
    const requested = params.get("server") ?? "";

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

    const wantsTiming = request.headers.get(DEBUG_HEADER) === "1";
    const log = sharedLog();
    if (wantsTiming) log.setEnabled(true);
    const startedAt = Date.now();
    const media = readMedia(params);
    log.event("route", "resolve.start", {
      traceId,
      source: provider.label,
      type: media.type,
      tmdbId: media.tmdbId,
      season: media.season ?? null,
      episode: media.episode ?? null,
      audioLanguage: media.audioLanguage,
    });

    try {
      const result = await provider.resolve(media, {
        signal: deadlineSignal(request),
        abandoned: request.signal,
        proxyOrigin: new URL(request.url).origin,
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
      if (traceId) headers[TRACE_HEADER] = traceId;
      log.event("route", "resolve.end", {
        traceId,
        source: provider.label,
        status: 200,
        ms: Date.now() - startedAt,
        candidates: result.candidates.length,
        subtitles: result.subtitles.length,
      });
      return NextResponse.json(
        {
          server: provider.id,
          serverLabel: provider.label,
          latencyMs: result.latencyMs,
          candidates: result.candidates,
          subtitles: result.subtitles,
          alternates: result.alternates ?? [],
        },
        { headers },
      );
    } catch (error) {
      if (error instanceof TypeError) {
        log.event("route", "resolve.end", {
          traceId,
          source: provider.label,
          status: 400,
          ms: Date.now() - startedAt,
          retryable: false,
          message: error.message,
        });
        return failure(400, {
          error: error.message,
          retryable: false,
          retryAfterMs: null,
          server: provider.id,
          details: null,
        });
      }

      const known =
        error instanceof RelayError ||
        ["RelayError", "VidsrcError", "VidfastError"].includes(error?.name);
      const aborted =
        error?.name === "AbortError" ||
        error?.name === "TimeoutError" ||
        timedOut(error);
      const status =
        known && error.status >= 400 ? error.status : aborted ? 504 : 502;
      const retryAfterMs = known ? error.retryAfterMs : null;

      log.event("route", "resolve.end", {
        traceId,
        source: provider.label,
        status,
        ms: Date.now() - startedAt,
        abandoned: Boolean(known && error.abandoned),
        retryable: aborted ? true : known ? Boolean(error.retryable) : false,
        retryAfterMs,
        message: error?.message,
        details: known ? error.details : null,
      });

      return failure(
        status,
        {
          error: aborted
            ? `${provider.label} did not answer in time`
            : error.message,
          retryable: aborted ? true : known ? Boolean(error.retryable) : false,
          retryAfterMs,
          server: provider.id,
          details: known ? error.details : null,
        },
        retryAfterMs,
      );
    }
  });
}
