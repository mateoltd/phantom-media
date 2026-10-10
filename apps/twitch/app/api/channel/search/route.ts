import { errorResponse } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { searchChannels } from "@/lib/search/service";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (!query || query.length < 2 || query.length > 80) {
    return NextResponse.json(
      { error: "Search query must be 2-80 characters" },
      { status: 400 }
    );
  }

  try {
    const result = await searchChannels(query, request.signal);
    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  } catch (error) { return errorResponse(error); }
}
