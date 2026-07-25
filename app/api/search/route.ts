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
import { resolveQuery } from "@/lib/youtube/resolve";
import type { SearchRequest, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    enforceRateLimit("search", getClientIp(request), 40);
    const body = await readJsonBody<SearchRequest>(request);
    const query = body.query?.trim();

    if (!query) {
      throw new HttpInputError("Query is required");
    }
    if (query.length > 200) {
      throw new HttpInputError("Search query is too long");
    }

    const result = await resolveQuery(null, `?${query}`);

    return NextResponse.json(
      { result } satisfies SearchResponse,
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
    logServerError("search", error);
    return NextResponse.json(
      { error: "Search is temporarily unavailable" },
      { status: 502, headers: noStoreJsonHeaders() }
    );
  }
}
