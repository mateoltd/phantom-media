import { NextResponse } from "next/server";
import {
  getClientIp,
  HttpInputError,
  noStoreJsonHeaders,
  readJsonBody,
} from "@/lib/server/http";
import {
  enforceRateLimit,
  RateLimitError,
} from "@/lib/server/rate-limit";
import { logServerError } from "@/lib/server/log";
import { resolveDownloadOptions } from "@/lib/youtube/streams";
import type { StreamsRequest, StreamsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export async function POST(request: Request) {
  try {
    enforceRateLimit("streams", getClientIp(request), 20);
    const body = await readJsonBody<StreamsRequest>(request);
    const videoId = body.videoId?.trim();

    if (!VIDEO_ID_PATTERN.test(videoId ?? "")) {
      throw new HttpInputError("A valid video ID is required");
    }

    const options = await resolveDownloadOptions(videoId);

    return NextResponse.json(
      { options } satisfies StreamsResponse,
      { headers: noStoreJsonHeaders() }
    );
  } catch (error) {
    if (error instanceof HttpInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: noStoreJsonHeaders() }
      );
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            ...noStoreJsonHeaders(),
            "Retry-After": String(error.retryAfterSeconds),
          },
        }
      );
    }
    logServerError("streams", error);
    return NextResponse.json(
      { error: "Could not load formats for this video" },
      { status: 502, headers: noStoreJsonHeaders() }
    );
  }
}
