import { NextRequest, NextResponse } from "next/server";
import { enrichWithCinemeta } from "@/lib/cinemeta";
import {
  directMedia,
  findByImdb,
  findByTmdb,
  searchOpenCatalog,
} from "@/lib/wikidata";
import type { MediaResult, MediaType } from "@/lib/types";

export const runtime = "nodejs";

const IMDB_PATTERN = /(?:imdb\.com\/title\/)?(tt\d{5,12})/i;
const TMDB_URL_PATTERN = /themoviedb\.org\/(movie|tv)\/(\d+)/i;
const TYPED_ID_PATTERN = /^(movie|tv)\s*[:/#-]\s*(\d+)$/i;

async function byTmdb(type: MediaType, id: string): Promise<MediaResult[]> {
  return enrichWithCinemeta([
    (await findByTmdb(type, id)) ?? directMedia(type, id),
  ]);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });

  try {
    const imdb = query.match(IMDB_PATTERN);
    if (imdb) {
      const results = await enrichWithCinemeta(
        await findByImdb(imdb[1].toLowerCase()),
      );
      return NextResponse.json({
        query,
        mode: "imdb",
        translatedFrom: imdb[1].toLowerCase(),
        results,
      });
    }

    const tmdbUrl = query.match(TMDB_URL_PATTERN);
    if (tmdbUrl) {
      const results = await byTmdb(
        tmdbUrl[1].toLowerCase() as MediaType,
        tmdbUrl[2],
      );
      return NextResponse.json({ query, mode: "tmdb-id", results });
    }

    const typed = query.match(TYPED_ID_PATTERN);
    if (typed) {
      const results = await byTmdb(
        typed[1].toLowerCase() as MediaType,
        typed[2],
      );
      return NextResponse.json({ query, mode: "tmdb-id", results });
    }

    return NextResponse.json({
      query,
      mode: "text",
      results: await enrichWithCinemeta(await searchOpenCatalog(query)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Open catalog search failed",
      },
      { status: 502 },
    );
  }
}
