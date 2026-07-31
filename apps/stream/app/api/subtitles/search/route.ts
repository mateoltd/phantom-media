import { NextRequest, NextResponse } from "next/server";
import {
  catalogUrl,
  type SubtitleCatalogEntry,
} from "@/lib/subtitles";
import type { MediaType, SubtitleTrack } from "@/lib/types";

export const runtime = "nodejs";

const IMDB_PATTERN = /^tt\d{5,12}$/i;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_TRACKS = 200;

const REVALIDATE_SECONDS = 4 * 60 * 60;

function normalize(entries: SubtitleCatalogEntry[]): SubtitleTrack[] {
  const seen = new Set<string>();
  const tracks: SubtitleTrack[] = [];

  for (const entry of entries) {
    if (typeof entry?.url !== "string") continue;
    let parsed;
    try {
      parsed = new URL(entry.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" || seen.has(parsed.href)) continue;
    seen.add(parsed.href);

    tracks.push({
      id: entry.id ? String(entry.id) : parsed.href,
      url: parsed.href,
      lang: entry.lang ?? "und",
      origin: "opensubtitles",
      encoding: entry.SubEncoding ?? undefined,
    });
    if (tracks.length >= MAX_TRACKS) break;
  }

  return tracks;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const imdbId = params.get("imdbId") ?? "";
  const mediaType = params.get("type") === "tv" ? "tv" : ("movie" as MediaType);

  if (!IMDB_PATTERN.test(imdbId)) {
    return NextResponse.json({ tracks: [] });
  }

  const season = Number(params.get("season"));
  const episode = Number(params.get("episode"));
  const url = catalogUrl(
    mediaType,
    imdbId.toLowerCase(),
    Number.isFinite(season) && season >= 0 ? season : undefined,
    Number.isFinite(episode) && episode > 0 ? episode : undefined,
  );

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return NextResponse.json({ tracks: [] });

    const body = (await response.json()) as { subtitles?: SubtitleCatalogEntry[] };
    return NextResponse.json({ tracks: normalize(body?.subtitles ?? []) });
  } catch {
    return NextResponse.json({ tracks: [] });
  }
}
