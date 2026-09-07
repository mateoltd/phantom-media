import { kindLabel } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

export function TitleMeta({
  media,
  tone = "default",
}: {
  media: MediaResult;
  tone?: "default" | "over-art";
}) {
  return (
    <div className={`meta-row ${tone === "over-art" ? "meta-row-over-art" : ""}`}>
      {media.rating > 0 && <span className="meta-rating">{media.rating.toFixed(1)}</span>}
      <span>{kindLabel(media.mediaType)}</span>
      {media.year && <span>{media.year}</span>}
      {media.runtime && <span>{media.runtime}</span>}
      {media.genres.length > 0 && (
        <span className="meta-tags">
          {media.genres.slice(0, 3).map((genre) => (
            <span key={genre} className="meta-tag">
              {genre}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
