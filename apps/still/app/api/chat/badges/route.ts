import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { fetchChatBadges } from "@/lib/twitch/badges";

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get("channel") ?? "";
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) {
    return NextResponse.json({ error: "Invalid chat channel" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchChatBadges(channel, request.signal), {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (error) { return errorResponse(error); }
}
