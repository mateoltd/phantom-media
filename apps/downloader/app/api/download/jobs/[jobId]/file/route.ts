import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  finishDownloadJobTransfer,
  getDownloadJobFile,
  recordDownloadJobTransfer,
} from "@/lib/download/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const file = getDownloadJobFile(jobId);
  if (!file) {
    return new Response("Download is not ready or has expired", { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), file.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.size}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? file.size - 1;
  const length = end - start + 1;
  const nodeStream = createReadStream(file.path, { start, end });
  let transferred = 0;
  let ended = false;
  nodeStream.on("data", (chunk) => {
    transferred += chunk.length;
    recordDownloadJobTransfer(jobId, start + transferred, transferred);
  });
  nodeStream.on("end", () => {
    ended = true;
    finishDownloadJobTransfer(jobId, end === file.size - 1);
  });
  nodeStream.on("close", () => {
    if (!ended) finishDownloadJobTransfer(jobId, false);
  });
  nodeStream.on("error", () => {
    finishDownloadJobTransfer(jobId, false);
  });
  const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const encodedName = encodeURIComponent(file.fileName);

  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${file.size}` }
        : {}),
    },
  });
}

function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";

  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number.parseInt(match[1], 10);
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return "invalid";
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}
