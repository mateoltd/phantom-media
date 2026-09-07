import Link from "next/link";
import { Artwork } from "@phantom/ui";
import { IconPlayerPlay } from "@tabler/icons-react";
import { mediaHref } from "@/lib/media";
import type { WatchlistMedia } from "@/lib/watchlist";
import { WatchlistButton } from "@/components/watchlist-button";

export function PosterTile({
  media,
  priority = false,
}: {
  media: WatchlistMedia;
  priority?: boolean;
}) {
  return (
    <div className="stream-poster relative min-w-0">
      <Link
        href={mediaHref(media)}
        aria-label={media.title}
        className="tile-hit group block min-w-0"
      >
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

          <span
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          >
            <IconPlayerPlay size={40} stroke={1.25} className="text-white" />
          </span>

          {media.rating > 0 && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur-sm">
              {media.rating.toFixed(1)}
            </span>
          )}
        </span>
        <span className="poster-caption" aria-hidden="true">
          <span className="poster-title">{media.title}</span>
          <span className="poster-meta">
            <span>{media.year}</span>
            <span>{media.mediaType === "tv" ? "Series" : "Film"}</span>
          </span>
        </span>
      </Link>
      <WatchlistButton media={media} compact />
    </div>
  );
}
