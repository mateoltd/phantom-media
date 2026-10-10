import { NextRequest, NextResponse } from "next/server";
import { UpstreamError } from "@/lib/errors";
import { fetchMoreChannelDiscovery } from "@/lib/discovery/load";
import { DiscoveryContinuationError } from "@/lib/discovery/continuation";

export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor") ?? "";
  const rawLanguages = request.nextUrl.searchParams.get("languages") ?? "";
  const languages = rawLanguages ? [...new Set(rawLanguages.toUpperCase().split(","))] : [];
  if (!/^[A-Za-z0-9+/_=-]{1,2048}$/.test(cursor) || languages.length > 3 || languages.some((language) => !/^[A-Z]{2}$/.test(language))) {
    return NextResponse.json({ error: "Invalid discovery cursor or languages" }, { status: 400 });
  }
  try {
    const data = await fetchMoreChannelDiscovery(cursor, languages);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    if (error instanceof DiscoveryContinuationError) return NextResponse.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const upstream = error instanceof UpstreamError ? error : new UpstreamError("transport", 15);
    return NextResponse.json({ error: upstream.message }, {
      status: upstream.status, headers: { ...(upstream.retryAfter ? { "Retry-After": String(upstream.retryAfter) } : {}), "Cache-Control": "no-store" },
    });
  }
}
