import Link from "next/link";
import { MediaTile } from "@phantom/ui";
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
        <MediaTile
          title={media.title}
          imageUrl={media.posterUrl}
          aspect="poster"
          priority={priority}
          sizes="(min-width: 1280px) 12vw, (min-width: 768px) 20vw, 40vw"
          badge={media.rating > 0 ? media.rating.toFixed(1) : undefined}
          meta={<><span>{media.year}</span><span>{media.mediaType === "tv" ? "Series" : "Film"}</span></>}
        />
      </Link>
      <WatchlistButton media={media} compact />
    </div>
  );
}
