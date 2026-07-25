import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WatchPageClient from "@/components/watch.client";
import {
  IMDB_ID_PATTERN,
  getTitle,
  placeholderTitle,
  type TitleDetail,
} from "@/lib/catalog";
import { imdbToTmdb, tmdbToImdb } from "@/lib/id-bridge";
import { kindLabel } from "@/lib/media";
import { SOURCE_ROSTER } from "@/src/source-ids.mjs";
import type { MediaType } from "@/lib/types";

interface WatchParams {
  params: Promise<{ type: string; id: string }>;
}

function parseParams(type: string, id: string): [MediaType, string] | null {
  if (type !== "movie" && type !== "tv") return null;
  if (!IMDB_ID_PATTERN.test(id) && !/^\d+$/.test(id)) return null;
  return [type, id];
}

/**
 * Routing is by IMDb id because that is what the catalog returns, but a pasted
 * TMDB link has to keep working, so a numeric id is translated first.
 */
async function loadTitle(
  mediaType: MediaType,
  id: string,
): Promise<TitleDetail> {
  const tmdbFromRoute = /^\d+$/.test(id) ? Number(id) : null;
  const imdbId = tmdbFromRoute
    ? await tmdbToImdb(mediaType, id)
    : id.toLowerCase();

  const detail = imdbId ? await getTitle(mediaType, imdbId) : null;
  if (!detail) {
    return {
      media: placeholderTitle(mediaType, { imdbId, tmdbId: tmdbFromRoute }),
      seasons: [],
      episodes: [],
    };
  }

  // The resolver only speaks TMDB. Cinemeta almost always carries that id; the
  // bridge covers the rest, so a title never arrives unplayable.
  if (detail.media.tmdbId === null) {
    detail.media.tmdbId =
      tmdbFromRoute ?? (await imdbToTmdb(mediaType, detail.media.imdbId ?? ""));
  }
  return detail;
}

export async function generateMetadata({
  params,
}: WatchParams): Promise<Metadata> {
  const { type, id } = await params;
  const parsed = parseParams(type, id);
  if (!parsed) return { title: "Not found" };

  const { media } = await loadTitle(...parsed);
  const kind = kindLabel(media.mediaType);
  return {
    title: media.year ? `${media.title} (${media.year})` : media.title,
    description:
      media.overview || `Watch ${media.title} — ${kind} on Phantom Stream.`,
    alternates: { canonical: `/watch/${media.mediaType}/${media.id}` },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: WatchParams) {
  const { type, id } = await params;
  const parsed = parseParams(type, id);
  if (!parsed) notFound();

  const { media, seasons, episodes } = await loadTitle(...parsed);
  return (
    <WatchPageClient
      media={media}
      seasons={seasons}
      episodes={episodes}
      sources={SOURCE_ROSTER}
    />
  );
}
