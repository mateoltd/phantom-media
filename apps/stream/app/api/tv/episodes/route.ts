import { NextRequest, NextResponse } from "next/server";
import { findByTmdb } from "@/lib/wikidata";
import type { EpisodeSummary, SeasonSummary } from "@/lib/types";

export const runtime = "nodejs";

type TvmazeShow = {
  id?: number;
  url?: string;
};

type TvmazeEpisode = {
  id?: number;
  name?: string;
  season?: number;
  number?: number | null;
  airdate?: string | null;
  summary?: string | null;
  runtime?: number | null;
  image?: {
    medium?: string | null;
    original?: string | null;
  } | null;
};

function plainText(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const tmdbId = request.nextUrl.searchParams.get("tmdbId")?.trim() ?? "";
  let imdbId = request.nextUrl.searchParams.get("imdbId")?.trim() ?? "";
  if (!/^\d+$/.test(tmdbId)) {
    return NextResponse.json(
      { error: "A valid TMDB series ID is required" },
      { status: 400 },
    );
  }

  try {
    if (!/^tt\d{5,12}$/i.test(imdbId)) {
      const media = await findByTmdb("tv", tmdbId);
      imdbId = media?.imdbId ?? "";
    }
    if (!imdbId) {
      return NextResponse.json(
        { error: "No IMDb mapping is available for this series" },
        { status: 404 },
      );
    }

    const lookupUrl = new URL("https://api.tvmaze.com/lookup/shows");
    lookupUrl.searchParams.set("imdb", imdbId);
    const showResponse = await fetch(lookupUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "PhantomStream/0.1 (keyless episode discovery)",
      },
      next: { revalidate: 3600 },
    });
    if (!showResponse.ok) {
      return NextResponse.json(
        { error: "This series is not listed by TVmaze" },
        { status: showResponse.status === 404 ? 404 : 502 },
      );
    }
    const show = (await showResponse.json()) as TvmazeShow;
    const showId = Number(show.id);
    if (!Number.isSafeInteger(showId) || showId <= 0) {
      throw new Error("TVmaze returned an invalid show identifier");
    }

    const episodesResponse = await fetch(
      `https://api.tvmaze.com/shows/${showId}/episodes?specials=1`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "PhantomStream/0.1 (keyless episode discovery)",
        },
        next: { revalidate: 3600 },
      },
    );
    if (!episodesResponse.ok) {
      throw new Error(`TVmaze returned HTTP ${episodesResponse.status}`);
    }
    const rawEpisodes = (await episodesResponse.json()) as TvmazeEpisode[];
    const episodes: EpisodeSummary[] = rawEpisodes
      .filter(
        (item) =>
          Number.isSafeInteger(item.season) &&
          Number.isSafeInteger(item.number) &&
          Number(item.season) >= 0 &&
          Number(item.number) > 0,
      )
      .map((item) => ({
        id: Number(item.id),
        name: item.name?.trim() || `Episode ${item.number}`,
        episodeNumber: Number(item.number),
        seasonNumber: Number(item.season),
        airDate: item.airdate ?? null,
        overview: plainText(item.summary),
        stillPath: item.image?.original ?? item.image?.medium ?? null,
        runtime: Number.isFinite(Number(item.runtime))
          ? Number(item.runtime)
          : null,
      }));

    const seasonMap = new Map<number, EpisodeSummary[]>();
    for (const episode of episodes) {
      const existing = seasonMap.get(episode.seasonNumber) ?? [];
      existing.push(episode);
      seasonMap.set(episode.seasonNumber, existing);
    }
    const seasons: SeasonSummary[] = [...seasonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, items]) => ({
        id: seasonNumber,
        name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
        seasonNumber,
        episodeCount: items.length,
        airDate: items[0]?.airDate ?? null,
        posterPath: null,
      }));

    return NextResponse.json({
      imdbId,
      source: "tvmaze",
      sourceUrl: show.url ?? "https://www.tvmaze.com",
      seasons,
      episodes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Episode lookup failed",
      },
      { status: 502 },
    );
  }
}
