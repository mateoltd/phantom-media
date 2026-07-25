import { NextResponse } from "next/server";
import {
  SOURCE_IDS,
  RelayClient,
  RelayError,
} from "../../../../src/relay-client.mjs";

export const runtime = "nodejs";

const CLIENT_VERSION = 1;
const globalClientState = globalThis.__phantomRelayClientState;
const client =
  globalClientState?.version === CLIENT_VERSION
    ? globalClientState.client
    : new RelayClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__phantomRelayClientState = {
    version: CLIENT_VERSION,
    client,
  };
}

function publicResult(result) {
  return {
    server: result.server,
    serverLabel: result.serverLabel,
    latencyMs: result.latencyMs,
    attemptedServers: result.attemptedServers,
    candidates: result.candidates,
    subtitles: result.subtitles,
    dubs: result.dubs,
    fallback: result.fallback,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const media = {
    type,
    tmdbId,
    title: (url.searchParams.get("title") ?? "").slice(0, 300),
    year: (url.searchParams.get("year") ?? "").slice(0, 10),
  };
  const imdbId = url.searchParams.get("imdbId") ?? "";
  if (/^tt\d{5,12}$/i.test(imdbId)) media.imdbId = imdbId.toLowerCase();
  if (type === "tv") {
    media.season = Number(url.searchParams.get("season"));
    media.episode = Number(url.searchParams.get("episode"));
  }

  try {
    const requested = url.searchParams.get("server") ?? "auto";
    const preferred =
      url.searchParams
        .get("prefer")
        ?.split(",")
        .filter((value) => SOURCE_IDS.includes(value)) ??
      SOURCE_IDS;
    const result =
      requested === "auto"
        ? await client.resolveAuto(media, { scrapers: preferred })
        : await client.resolveScraper(media, requested);

    return NextResponse.json(publicResult(result), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const known = error instanceof RelayError;
    const status =
      known && error.status && error.status >= 400 ? error.status : 502;
    const retryAfterMs = known ? error.retryAfterMs : null;
    return NextResponse.json(
      {
        error: error.message,
        retryable: known ? error.retryable : false,
        retryAfterMs,
        server: known ? error.server : null,
        details: known ? error.details : null,
      },
      {
        status,
        headers:
          retryAfterMs && retryAfterMs > 0
            ? { "retry-after": String(Math.ceil(retryAfterMs / 1_000)) }
            : undefined,
      },
    );
  }
}
