import { NextRequest, NextResponse } from "next/server";
import { searchChannels } from "@/lib/twitch";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (!query || query.length < 2 || query.length > 80) {
    return NextResponse.json(
      { error: "Search query must be 2-80 characters" },
      { status: 400 }
    );
  }

  try {
    const results = await searchChannels(query);
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
