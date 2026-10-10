import { UpstreamError } from "../../../../lib/errors.ts";
import { readLimitedText } from "../../../../lib/media/read.ts";
import { fetchChannelDiscovery } from "../../../../lib/discovery/load.ts";
import { parseDiscoveryHistory, type DiscoveryHistory } from "../../../../lib/discovery/ranking.ts";

export async function POST(request: Request) {
  let body: unknown;
  try { body = JSON.parse(await readLimitedText(new Response(request.body), 128 * 1024, request.signal)); } catch (error) {
    if (error instanceof UpstreamError && error.kind === "cap") return Response.json({ error: "Discovery request too large" }, { status: 413 });
    return Response.json({ error: "Invalid discovery request JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid discovery request" }, { status: 400 });
  }
  const { channels, history } = body as { channels?: unknown; history?: unknown };
  return discover(channels === undefined ? [] : channels, parseDiscoveryHistory(history));
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
    const upstream = error instanceof UpstreamError ? error : new UpstreamError("transport", 15);
    return Response.json({ error: upstream.message }, {
      status: upstream.status,
      headers: { ...(upstream.retryAfter ? { "Retry-After": String(upstream.retryAfter) } : {}), "Cache-Control": "no-store" },
    });
  }
}
