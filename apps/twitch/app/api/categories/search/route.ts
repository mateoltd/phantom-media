import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { searchCategories } from "@/lib/twitch/categories";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (term.length < 2 || term.length > 80) return Response.json({ error: "Invalid category search" }, { status: 400 });
  try { return Response.json({ categories: await searchCategories(term) }, { headers: { "Cache-Control": "public, max-age=60" } }); }
  catch (error) { return errorResponse(error); }
}
