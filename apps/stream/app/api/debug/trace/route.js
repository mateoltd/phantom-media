import { NextResponse } from "next/server";
import {
  appendClientDebugEntries,
  debugLogPath,
  serverDebugEnabled,
} from "../../../../src/debug-server.mjs";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;

function unavailable() {
  return NextResponse.json({ error: "Local debug trace is disabled" }, {
    status: 404,
  });
}

export function GET() {
  if (!serverDebugEnabled()) return unavailable();
  return NextResponse.json({
    enabled: true,
    path: debugLogPath(),
  });
}

export async function POST(request) {
  if (!serverDebugEnabled()) return unavailable();
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Debug batch is too large" }, {
      status: 413,
    });
  }

  let payload;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new RangeError();
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid debug batch" }, { status: 400 });
  }

  if (!Array.isArray(payload?.entries)) {
    return NextResponse.json({ error: "Invalid debug entries" }, { status: 400 });
  }
  await appendClientDebugEntries(payload.sessionId, payload.entries);
  return new Response(null, { status: 204 });
}
