import { NextRequest } from "next/server";
import { resolveClip } from "@/lib/playback/clips";
import { errorResponse } from "@/lib/errors";
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !/^[A-Za-z0-9_-]{1,150}$/.test(slug)) return new Response("Invalid clip", { status: 400 });
  try { return Response.json(await resolveClip(slug, request.nextUrl.searchParams.get("refresh") === "1", request.signal), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
