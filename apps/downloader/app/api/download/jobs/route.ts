import { NextResponse } from "next/server";
import {
  createDownloadJob,
  DownloadJobLimitError,
  InvalidDownloadJobError,
} from "@/lib/download/server/jobs";
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
import type { CreateDownloadJobRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    enforceRateLimit("download-job", clientIp, 8);
    const input = await readJsonBody<CreateDownloadJobRequest>(request);

    return NextResponse.json(createDownloadJob(input, clientIp), {
      status: 202,
      headers: noStoreJsonHeaders(),
    });
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
    if (error instanceof InvalidDownloadJobError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: noStoreJsonHeaders() }
      );
    }
    if (error instanceof DownloadJobLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { ...noStoreJsonHeaders(), "Retry-After": "15" },
        }
      );
    }

    logServerError("download-job", error);
    return NextResponse.json(
      { error: "Could not start the download" },
      { status: 500, headers: noStoreJsonHeaders() }
    );
  }
}
