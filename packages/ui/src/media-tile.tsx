import { type ReactNode } from "react";
import { Play } from "lucide-react";
import { Artwork } from "./artwork";

/** Stream's artwork and unboxed caption, for posters and video thumbnails. */
export function MediaTile({ title, imageUrl, aspect = "video", meta, badge, priority = false, sizes }: {
  title: string;
  imageUrl?: string | null;
  aspect?: "video" | "poster";
  meta?: ReactNode;
  badge?: ReactNode;
  priority?: boolean;
  sizes?: string;
}) {
  return <>
    <span className={`media-tile-art ${aspect === "poster" ? "tile aspect-[2/3]" : "aspect-video"}`}>
      <Artwork src={imageUrl} sizes={sizes} priority={priority} fallback={<span className="flex h-full items-center justify-center px-3 text-center text-sm text-text-tertiary">{title}</span>} />
      <span className="media-tile-play" aria-hidden="true"><Play size={40} strokeWidth={1.25} /></span>
      {badge && <span className="media-tile-badge">{badge}</span>}
    </span>
    <span className="media-tile-caption">
      <span className="media-tile-title">{title}</span>
      {meta && <span className="media-tile-meta">{meta}</span>}
    </span>
  </>;
}
