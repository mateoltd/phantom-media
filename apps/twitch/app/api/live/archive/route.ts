import { NextRequest, NextResponse } from "next/server";
import { resolveStreamArchive } from "@/lib/resolve";

export async function GET(request: NextRequest) {
  const channel = (request.nextUrl.searchParams.get("channel") ?? "").trim().toLowerCase();

  if (!/^[a-z0-9_]{3,25}$/.test(channel)) {
    return NextResponse.json({ error: "Missing or invalid channel" }, { status: 400 });
  }

  const data = await resolveStreamArchive(channel).catch(() => null);
  return NextResponse.json(
    { available: Boolean(data), masterUrl: data ? `/api/vod/master.m3u8?archive=${encodeURIComponent(channel)}` : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
