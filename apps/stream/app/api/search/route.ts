import { NextRequest, NextResponse } from "next/server";
import { getTitle, searchCatalog } from "@/lib/catalog";
import { tmdbToImdb } from "@/lib/id-bridge";
import type { MediaResult, MediaType } from "@/lib/types";

export const runtime = "nodejs";

const IMDB_PATTERN = /(?:imdb\.com\/title\/)?(tt\d{5,12})/i;
const TMDB_URL_PATTERN = /themoviedb\.org\/(movie|tv)\/(\d+)/i;
const TYPED_ID_PATTERN = /^(movie|tv)\s*[:/#-]\s*(\d+)$/i;

async function byImdb(imdbId: string): Promise<MediaResult[]> {
  const found = await Promise.all(
    (["movie", "tv"] as const).map((mediaType) => getTitle(mediaType, imdbId)),
  );
  return found
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
    .map((detail) => detail.media);
}

async function byTmdb(
  mediaType: MediaType,
  tmdbId: string,
): Promise<MediaResult[]> {
  const imdbId = await tmdbToImdb(mediaType, tmdbId);
  if (!imdbId) return [];
  const detail = await getTitle(mediaType, imdbId);
  return detail ? [detail.media] : [];
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ query, mode: "text", results: [] });

  try {
    const imdb = query.match(IMDB_PATTERN);
    if (imdb) {
      return NextResponse.json({
        query,
        mode: "imdb",
        results: await byImdb(imdb[1].toLowerCase()),
      });
    }

    const tmdbUrl = query.match(TMDB_URL_PATTERN) ?? query.match(TYPED_ID_PATTERN);
    if (tmdbUrl) {
      return NextResponse.json({
        query,
        mode: "tmdb-id",
        results: await byTmdb(tmdbUrl[1].toLowerCase() as MediaType, tmdbUrl[2]),
      });
    }

    return NextResponse.json({
      query,
      mode: "text",
      results: await searchCatalog(query),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The catalog search failed",
      },
      { status: 502 },
    );
  }
}
