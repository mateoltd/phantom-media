import { NextRequest, NextResponse } from "next/server";
import { searchIndex } from "@/lib/search/service";
import { errorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ channels: await searchIndex(request.signal) }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (error) { return errorResponse(error); }
}
