import { NextResponse } from "next/server";
import {
  cancelDownloadJob,
  getDownloadJob,
} from "@/lib/download/server/jobs";
import { noStoreJsonHeaders } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getDownloadJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Download job not found" },
      { status: 404, headers: noStoreJsonHeaders() }
    );
  }
  return NextResponse.json(job, { headers: noStoreJsonHeaders() });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  if (!cancelDownloadJob(jobId)) {
    return NextResponse.json(
      { error: "Download job not found" },
      { status: 404, headers: noStoreJsonHeaders() }
    );
  }
  return new Response(null, {
    status: 204,
    headers: noStoreJsonHeaders(),
  });
}
