import { NextRequest, NextResponse } from "next/server";
import { autocompleteChannels } from "@/lib/search/autocomplete";
import { errorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (query.length < 2 || query.length > 80) return NextResponse.json({ error: "Search query must be 2-80 characters" }, { status: 400 });
  try {
    return NextResponse.json(await autocompleteChannels(query, request.signal), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch (error) { return errorResponse(error); }
}
