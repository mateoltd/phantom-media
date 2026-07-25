import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WatchPageClient from "@/components/watch.client";
import { enrichWithCinemeta } from "@/lib/cinemeta";
import { directMedia, findByTmdb } from "@/lib/wikidata";
import { kindLabel } from "@/lib/media";
import { SOURCE_ROSTER } from "@/src/source-ids.mjs";
import type { MediaResult, MediaType } from "@/lib/types";

interface WatchParams {
  params: Promise<{ type: string; id: string }>;
}

function parseParams(type: string, id: string): [MediaType, string] | null {
  if (type !== "movie" && type !== "tv") return null;
  if (!/^\d+$/.test(id)) return null;
  return [type, id];
}

async function loadMedia(type: MediaType, id: string): Promise<MediaResult> {
  const found = (await findByTmdb(type, id)) ?? directMedia(type, id);
  const [enriched] = await enrichWithCinemeta([found]);
  return enriched ?? found;
}

export async function generateMetadata({
  params,
}: WatchParams): Promise<Metadata> {
  const { type, id } = await params;
  const parsed = parseParams(type, id);
  if (!parsed) return { title: "Not found" };

  const media = await loadMedia(...parsed);
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

  const media = await loadMedia(...parsed);
  return <WatchPageClient media={media} sources={SOURCE_ROSTER} />;
}
