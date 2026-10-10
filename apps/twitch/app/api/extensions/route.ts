import { fetchExtensions } from "@/lib/twitch/extensions";
import { errorResponse } from "@/lib/errors";
export async function GET(request: Request) {
  try { return Response.json({ entries: await fetchExtensions(request.signal), coverage: "first-page", continuation: "unsupported" }, { headers: { "Cache-Control": "public, max-age=300" } }); }
  catch (error) { return errorResponse(error); }
}
