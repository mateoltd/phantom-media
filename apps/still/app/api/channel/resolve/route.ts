import { errorResponse } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { fetchChannelBasics } from "@/lib/twitch/channels";

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
    const data = await fetchChannelBasics(channel);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": data.stream
          ? "public, max-age=20, s-maxage=30"
          : "public, max-age=120, s-maxage=300",
      },
    });
  } catch (error) { return errorResponse(error); }
}
