import { NextResponse } from "next/server";
import { getPoTokenProviderUrl } from "@/lib/youtube/yt-dlp-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providerUrl = getPoTokenProviderUrl();
  let poTokenProvider: "disabled" | "ok" | "unavailable" = "disabled";

  if (providerUrl) {
    try {
      const response = await fetch(`${providerUrl}/ping`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      poTokenProvider = response.ok ? "ok" : "unavailable";
      await response.body?.cancel();
    } catch {
      poTokenProvider = "unavailable";
    }
  }

  const healthy = poTokenProvider !== "unavailable";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      poTokenProvider,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
