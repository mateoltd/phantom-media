import { NextRequest, NextResponse } from "next/server";
import {
  catalogUrl,
  type SubtitleCatalogEntry,
} from "@/lib/subtitles";
import type { MediaType, SubtitleTrack } from "@/lib/types";

export const runtime = "nodejs";

const IMDB_PATTERN = /^tt\d{5,12}$/i;
const REQUEST_TIMEOUT_MS = 6_000;
/** Well past what any title has, and a bound on what the menu has to render. */
const MAX_TRACKS = 200;

/**
 * The catalogue caches for four hours upstream. There is no reason to ask it
 * more often than that for a file that has not changed since it was uploaded.
 */
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
      // Upstream names the encoding it stored, which is the only way the
      // proxy can decode a file that predates anyone using UTF-8.
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

  // The catalogue is keyed on IMDb ids and nothing else, so a title without
  // one has no subtitles here rather than a broken lookup.
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
    // Subtitles are an addition, never a precondition for playing something,
    // so a catalogue that is down means an empty menu and no error anywhere.
    return NextResponse.json({ tracks: [] });
  }
}
