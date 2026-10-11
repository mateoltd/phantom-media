import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { fetchChannelPoll } from "@/lib/twitch/polls";

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get("channel") ?? "";
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) {
    return NextResponse.json({ error: "Invalid chat channel" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchChannelPoll(channel, request.signal), {
      headers: { "Cache-Control": "public, max-age=5, s-maxage=5" },
    });
  } catch (error) { return errorResponse(error); }
}
