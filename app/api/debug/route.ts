import { NextResponse } from "next/server";
import { getInnertube, CLIENT_FALLBACK_ORDER } from "@/lib/youtube/client";

export const runtime = "nodejs";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const yt = await getInnertube();
    results.innertube = "created";
    results.po_token = yt.session.po_token ? `${yt.session.po_token.substring(0, 20)}...` : "none";
    results.visitor_data = yt.session.context.client?.visitorData
      ? `${yt.session.context.client.visitorData.substring(0, 20)}...`
      : "none";

    // Test each client type
    for (const client of CLIENT_FALLBACK_ORDER) {
      try {
        const info = await yt.getBasicInfo("dQw4w9WgXcQ", { client });
        results[`client_${client}`] = {
          title: info.basic_info?.title?.substring(0, 30),
          hasStreaming: !!info.streaming_data,
          formats: info.streaming_data?.formats?.length ?? 0,
          adaptive: info.streaming_data?.adaptive_formats?.length ?? 0,
        };
      } catch (e) {
        results[`client_${client}`] = {
          error: e instanceof Error ? e.message.substring(0, 100) : "unknown",
        };
      }
    }
  } catch (e) {
    results.error = e instanceof Error ? e.message : "unknown";
  }

  return NextResponse.json(results);
}
