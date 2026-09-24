import { NextRequest, NextResponse } from "next/server";
import { DiscoveryUpstreamError, fetchMoreChannelDiscovery } from "@/lib/twitch";

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
    const upstream = error instanceof DiscoveryUpstreamError ? error : new DiscoveryUpstreamError(502, 15);
    return NextResponse.json({ error: upstream.message }, {
      status: upstream.status, headers: { ...(upstream.retryAfter ? { "Retry-After": String(upstream.retryAfter) } : {}), "Cache-Control": "no-store" },
    });
  }
}
