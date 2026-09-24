import { NextRequest, NextResponse } from "next/server";
import { fetchChannel } from "@/lib/twitch";

function normalizeChannel(value: string | null): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function GET(request: NextRequest) {
  const channel = normalizeChannel(request.nextUrl.searchParams.get("channel"));

  if (!channel || !/^[a-z0-9_]{3,25}$/.test(channel)) {
    return NextResponse.json(
      { error: "Missing or invalid channel" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchChannel(channel);
    if (!data.stream) {
      return NextResponse.json(
        { error: "Channel is not live", channel: data.login },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        channel: data.login,
        displayName: data.displayName,
        profileImageURL: data.profileImageURL,
        stream: data.stream,
        masterUrl: `/api/live/master.m3u8?channel=${encodeURIComponent(data.login)}`,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=10, s-maxage=20",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
