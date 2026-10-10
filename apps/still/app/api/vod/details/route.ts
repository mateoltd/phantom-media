import { NextRequest } from "next/server";
import { fetchVideoDetails } from "@/lib/twitch/video-details";
import { errorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("vodId") ?? "";
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Invalid video ID" }, { status: 400 });
  try {
    return Response.json(await fetchVideoDetails(id, request.signal), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch (error) { return errorResponse(error); }
}
