import { NextRequest } from "next/server";
import { resolveCurrentArchive } from "@/lib/playback/current-archive";
export async function GET(request: NextRequest) {
  const channel = (request.nextUrl.searchParams.get("channel") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(channel)) return Response.json({ error: "Invalid channel" }, { status: 400 });
  const data = await resolveCurrentArchive(channel, request.signal).catch(() => null);
  const params = data ? new URLSearchParams({ archive: data.resource.channel, streamId: data.resource.streamId, startedAt: data.resource.startedAt }) : null;
  return Response.json({ resource: data?.resource, available: Boolean(data), masterUrl: data ? `/api/vod/master.m3u8?${params}` : null }, { headers: { "Cache-Control": "no-store" } });
}
