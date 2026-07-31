import { NextResponse } from "next/server";
import {
  VidsrcError,
  createVidsrcResolver,
} from "../../../../../src/providers/vidsrc.mjs";

export const runtime = "nodejs";

const resolver = createVidsrcResolver("n1");
const DEADLINE_MS = 8_500;

function mediaFrom(url) {
  const params = new URL(url).searchParams;
  const media = {
    type: params.get("type"),
    tmdbId: Number(params.get("tmdbId")),
  };
  if (media.type === "tv") {
    media.season = Number(params.get("season"));
    media.episode = Number(params.get("episode"));
  }
  return media;
}

export async function GET(request) {
  try {
    const result = await resolver(mediaFrom(request.url), {
      proxyOrigin: new URL(request.url).origin,
      signal: request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(DEADLINE_MS)])
        : AbortSignal.timeout(DEADLINE_MS),
    });
    return NextResponse.json(
      {
        server: "n1",
        serverLabel: result.candidates[0]?.serverLabel ?? "n1",
        ...result,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const invalid = error instanceof TypeError;
    const known = error instanceof VidsrcError;
    const aborted =
      error?.name === "AbortError" || error?.name === "TimeoutError";
    return NextResponse.json(
      {
        error: aborted ? "VidSrc did not answer in time" : error.message,
        retryable: known ? error.retryable : aborted,
        details: known ? error.details : null,
      },
      { status: invalid ? 400 : aborted ? 504 : 502 },
    );
  }
}
