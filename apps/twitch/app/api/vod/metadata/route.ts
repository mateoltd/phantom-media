import { errorResponse } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { fetchVodMetadata } from "@/lib/twitch/videos";

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId") ?? "";
  if (!/^\d{1,20}$/.test(vodId)) return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  try {
    const video = await fetchVodMetadata(vodId);
    return NextResponse.json({
      vodId, title: video.title, channel: video.owner.login,
      previewThumbnailURL: video.previewThumbnailURL,
      broadcastType: video.broadcastType, lengthSeconds: video.lengthSeconds,
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (error) { return errorResponse(error); }
}
