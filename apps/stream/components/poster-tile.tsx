import Link from "next/link";
import { Artwork } from "@phantom/ui";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

/**
 * One title in a rail or a grid. Everything but the artwork is held back until
 * the pointer arrives: a wall of posters reads as a wall of posters, and a
 * wall of posters with captions reads as a spreadsheet.
 */
export function PosterTile({
  media,
  priority = false,
}: {
  media: MediaResult;
  priority?: boolean;
}) {
  return (
    <Link href={mediaHref(media)} className="tile-hit group block">
      <span className="tile block aspect-[2/3]">
        <Artwork
          src={media.posterUrl}
          sizes="(min-width: 1280px) 12vw, (min-width: 768px) 20vw, 40vw"
          priority={priority}
          fallback={
            <span className="flex h-full w-full items-center justify-center px-3 text-center text-[13px] font-extrabold leading-tight text-text-tertiary">
              {media.title}
            </span>
          }
        />

        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />

        <span className="absolute inset-x-0 bottom-0 translate-y-1.5 p-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-phantom text-white">
              <IconPlayerPlayFilled size={13} />
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 text-[12px] font-extrabold leading-tight text-white">
                {media.title}
              </span>
              {media.year && (
                <span className="mt-0.5 block text-[10px] font-semibold text-white/60">
                  {media.year}
                </span>
              )}
            </span>
          </span>
        </span>

        {media.rating > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur-sm">
            {media.rating.toFixed(1)}
          </span>
        )}
      </span>
    </Link>
  );
}
