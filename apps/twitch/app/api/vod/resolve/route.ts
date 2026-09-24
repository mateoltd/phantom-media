import { NextRequest, NextResponse } from "next/server";
import { extractVodId } from "@/lib/validation";
import { resolveVod } from "@/lib/resolve";
import { isRateLimited } from "@/lib/rate-limit";

function createResolveResponse(data: Awaited<ReturnType<typeof resolveVod>>) {
  return NextResponse.json(
    {
      vodId: data.vodId,
      channel: data.channel,
      channelDisplayName: data.channelDisplayName,
      channelProfileImageURL: data.channelProfileImageURL,
      title: data.title,
      previewThumbnailURL: data.previewThumbnailURL,
      isLiveArchive: data.isLiveArchive,
      broadcastType: data.broadcastType,
      qualities: data.qualities,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId");

  if (!vodId || !/^\d+$/.test(vodId)) {
    return NextResponse.json(
      { error: "Missing or invalid vodId" },
      { status: 400 }
    );
  }

  try {
    const data = await resolveVod(vodId);
    return createResolveResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const vodId = extractVodId(body.url ?? "");
  if (!vodId) {
    return NextResponse.json(
      { error: "Invalid VOD URL or ID" },
      { status: 400 }
    );
  }

  try {
    const data = await resolveVod(vodId);
    return createResolveResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
