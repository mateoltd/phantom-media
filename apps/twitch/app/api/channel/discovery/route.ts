import { NextRequest, NextResponse } from "next/server";
import { DiscoveryUpstreamError, fetchChannelDiscovery } from "@/lib/twitch";
import type { DiscoveryHistory } from "@/lib/discovery";

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("channels") ?? "";
  const logins = value ? [...new Set(value.toLowerCase().split(","))] : [];
  if (logins.length > 6 || logins.some((login) => !/^[a-z0-9_]{3,25}$/.test(login))) {
    return NextResponse.json({ error: "Invalid channels" }, { status: 400 });
  }
  let history: DiscoveryHistory[] = [];
  const raw = request.nextUrl.searchParams.get("history");
  if (raw) {
    try {
      if (raw.length > 16_000) throw new Error("History too large");
      const entries: unknown = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length > 30) throw new Error("Invalid history");
      history = entries.map((entry) => {
        if (!entry || typeof entry.channel !== "string" || !/^[a-z0-9_]{3,25}$/i.test(entry.channel)
          || typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp) || entry.timestamp < 0
          || (entry.vodId !== undefined && (typeof entry.vodId !== "string" || !/^\d{1,20}$/.test(entry.vodId)))
          || (entry.title !== undefined && (typeof entry.title !== "string" || entry.title.length > 500))) throw new Error("Invalid history");
        return { channel: entry.channel.toLowerCase(), timestamp: Math.min(Date.now(), entry.timestamp), vodId: entry.vodId, title: entry.title };
      }).sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return NextResponse.json({ error: "Invalid history" }, { status: 400 });
    }
  }
  const selected = logins.length ? logins : [...new Set(history.map((entry) => entry.channel))].slice(0, 6);
  try {
    const data = await fetchChannelDiscovery(selected, history);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    const upstream = error instanceof DiscoveryUpstreamError ? error : new DiscoveryUpstreamError(502, 15);
    return NextResponse.json({ error: upstream.message }, {
      status: upstream.status,
      headers: { ...(upstream.retryAfter ? { "Retry-After": String(upstream.retryAfter) } : {}), "Cache-Control": "no-store" },
    });
  }
}
