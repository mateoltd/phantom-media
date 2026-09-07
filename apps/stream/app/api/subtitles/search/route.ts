import { NextRequest, NextResponse } from "next/server";
import {
  catalogUrl,
  type SubtitleCatalogEntry,
} from "@/lib/subtitles";
import type { MediaType, SubtitleTrack } from "@/lib/types";
import { normalizeLanguage } from "@/lib/subtitles";
import { subdlTracks } from "@/src/subdl.mjs";

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
  if (mediaType === "tv" && (!Number.isInteger(season) || season < 0 ||
      !Number.isInteger(episode) || episode < 1)) {
    return NextResponse.json({ tracks: [] });
  }
  const url = catalogUrl(
    mediaType,
    imdbId.toLowerCase(),
    Number.isFinite(season) && season >= 0 ? season : undefined,
    Number.isFinite(episode) && episode > 0 ? episode : undefined,
  );

  let tracks: SubtitleTrack[] = [];
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (response.ok) {
      const body = (await response.json()) as { subtitles?: SubtitleCatalogEntry[] };
      tracks = normalize(body?.subtitles ?? []);
    }
  } catch { /* One unavailable catalog must not disable the other. */ }

  const key = process.env.SUBDL_API_KEY;
  if (key && !tracks.some(track => normalizeLanguage(track.lang) === "es")) {
    const query = new URLSearchParams({ api_key: key, imdb_id: imdbId.toLowerCase(),
      type: mediaType, languages: "ES", unpack: "1", subs_per_page: "30" });
    if (mediaType === "tv") {
      query.set("season_number", String(season));
      query.set("episode_number", String(episode));
    }
    try {
      const response = await fetch(`https://api.subdl.com/api/v1/subtitles?${query}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (response.ok) tracks.push(...subdlTracks(await response.json(), {
        imdbId: imdbId.toLowerCase(), mediaType, season, episode,
      }));
    } catch { /* Keep existing tracks available; never log key-bearing URLs. */ }
  }
  return NextResponse.json({ tracks });
}
