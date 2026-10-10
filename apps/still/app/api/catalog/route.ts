import { NextRequest } from "next/server";
import { validateSlice } from "@/lib/catalog/slices";
import { fetchCatalogSlice } from "@/lib/twitch/catalogs";
import { errorResponse } from "@/lib/errors";
export async function GET(request: NextRequest) {
  let slice;
  try { slice = validateSlice(JSON.parse(request.nextUrl.searchParams.get("slice") ?? "null")); }
  catch { return Response.json({ error: "Invalid catalog slice" }, { status: 400 }); }
  try { return Response.json(await fetchCatalogSlice(slice, request.signal), { headers: { "Cache-Control": "public, max-age=60" } }); }
  catch (error) { return errorResponse(error); }
}
