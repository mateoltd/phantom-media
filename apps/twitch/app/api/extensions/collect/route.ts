import { readLimitedText } from "@/lib/media/read";
import { fetchExtensionViewer } from "@/lib/twitch/extensions";
import { collectExtension } from "@/lib/extensions/collect";
import { errorResponse } from "@/lib/errors";
export async function POST(request: Request) {
  if (Number(request.headers.get("Content-Length")) > 1024) return new Response("Request too large", { status: 413 });
  let clientId: unknown;
  try { const text = await readLimitedText(new Response(request.body), 1024, request.signal); clientId = JSON.parse(text).clientId; } catch { return new Response("Invalid request", { status: 400 }); }
  if (typeof clientId !== "string" || !/^[a-z0-9]{12,40}$/.test(clientId)) return new Response("Invalid client ID", { status: 400 });
  try {
    const location = await fetchExtensionViewer(clientId, request.signal);
    if (!location) return Response.json({ error: "Viewer assets are unresolved" }, { status: 404 });
    return Response.json(await collectExtension(location, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
