import { DiscoveryUpstreamError, fetchChannelDiscovery } from "../../../../lib/twitch.ts";
import { parseDiscoveryHistory, type DiscoveryHistory } from "../../../../lib/discovery.ts";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid discovery request JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid discovery request" }, { status: 400 });
  }
  const { channels, history } = body as { channels?: unknown; history?: unknown };
  return discover(channels === undefined ? [] : channels, parseDiscoveryHistory(history));
}

/** Older clients can still load a feed even if their URL history was truncated. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const value = params.get("channels") ?? "";
  let history: unknown;
  const raw = params.get("history");
  if (raw && raw.length <= 16_000) {
    try { history = JSON.parse(raw); } catch { /* History is only a recommendation hint. */ }
  }
  return discover(value ? value.split(",") : [], parseDiscoveryHistory(history));
}

async function discover(channels: unknown, history: DiscoveryHistory[]) {
  if (!Array.isArray(channels) || channels.some((login) => typeof login !== "string" || !/^[a-z0-9_]{3,25}$/i.test(login))) {
    return Response.json({ error: "Invalid channels" }, { status: 400 });
  }
  const logins = [...new Set((channels as string[]).map((login) => login.toLowerCase()))];
  if (logins.length > 6) return Response.json({ error: "Invalid channels" }, { status: 400 });
  const selected = logins.length ? logins : [...new Set(history.map((entry) => entry.channel))].slice(0, 6);
  try {
    const data = await fetchChannelDiscovery(selected, history);
    return Response.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    const upstream = error instanceof DiscoveryUpstreamError ? error : new DiscoveryUpstreamError(502, 15);
    return Response.json({ error: upstream.message }, {
      status: upstream.status,
      headers: { ...(upstream.retryAfter ? { "Retry-After": String(upstream.retryAfter) } : {}), "Cache-Control": "no-store" },
    });
  }
}
