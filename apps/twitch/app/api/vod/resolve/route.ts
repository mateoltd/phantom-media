import { NextRequest } from "next/server";
import { resolveVod } from "@/lib/playback/resolve";
import { playbackCacheControl } from "@/lib/playback/freshness";
import { errorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("vodId") ?? "";
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Invalid video ID" }, { status: 400 });
  try {
    const data = await resolveVod(id, request.signal);
    return Response.json(data, { headers: { "Cache-Control": playbackCacheControl(data.lifecycle) } });
  } catch (error) { return errorResponse(error); }
}
