import { kindLabel } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

/**
 * The line under a title: what it is, when it is from, how long it runs, what
 * it is about. Spacing does the separating — a row of interpuncts is a habit
 * from print listings, not something a viewer needs.
 */
export function TitleMeta({
  media,
  tone = "default",
}: {
  media: MediaResult;
  /** `over-art` sits on a backdrop and needs more contrast than page copy. */
  tone?: "default" | "over-art";
}) {
  return (
    <div className={`meta-row ${tone === "over-art" ? "text-text" : ""}`}>
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
