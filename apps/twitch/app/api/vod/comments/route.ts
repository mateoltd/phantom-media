import { NextRequest, NextResponse } from "next/server";
import { fetchVodComments } from "@/lib/twitch";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const vodId = params.get("vodId") ?? "";
  const offset = Number(params.get("offset") ?? 0);
  if (!/^\d{1,20}$/.test(vodId) || !Number.isFinite(offset) || offset < 0 || offset > 31_536_000) {
    return NextResponse.json({ error: "Invalid chat replay request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchVodComments(vodId, offset), {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat replay is unavailable";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 502 });
  }
}
