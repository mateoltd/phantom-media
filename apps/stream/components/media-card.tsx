"use client";

import Image from "next/image";
import Link from "next/link";
import { IconPlayerPlayFilled, IconStarFilled } from "@tabler/icons-react";
import { kindLabel, mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

export function MediaCard({
  media,
  priority = false,
}: {
  media: MediaResult;
  priority?: boolean;
}) {
  const image = media.posterUrl;

  return (
    <Link
      href={mediaHref(media)}
      className="group block focus-visible:outline-none"
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-[#ded9cf] shadow-[0_10px_28px_rgba(45,35,24,0.1)] transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 45vw"
            unoptimized
            priority={priority}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-mono text-4xl font-extrabold text-text-tertiary">
            {media.title.slice(0, 1)}
          </span>
        )}

        <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-phantom text-white shadow-[0_6px_20px_rgba(24,24,21,0.35)]">
            <IconPlayerPlayFilled size={18} />
          </span>
        </span>

        <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-text-secondary backdrop-blur-sm">
          {kindLabel(media.mediaType)}
        </span>
      </span>

      <span className="mt-2.5 block">
        <span className="line-clamp-2 block text-[13px] font-extrabold leading-[1.35] text-text">
          {media.title}
        </span>
        <span className="mt-1 flex items-center gap-2 font-mono text-[10px] text-text-tertiary">
          {media.year}
          {media.rating > 0 && (
            <span className="flex items-center gap-0.5 text-text-secondary">
              <IconStarFilled size={9} className="text-phantom" />
              {media.rating.toFixed(1)}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
