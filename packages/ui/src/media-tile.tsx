import { type ReactNode } from "react";
import { Play } from "@phosphor-icons/react/ssr";
import { Artwork } from "./artwork";

/** Shared artwork and unboxed caption for media surfaces. */
export function MediaTile({ title, imageUrl, aspect = "video", meta, badge, priority = false, sizes, titleLines = 1, overlay, showPlayOverlay = true }: {
  title: string;
  imageUrl?: string | null;
  aspect?: "video" | "poster";
  meta?: ReactNode;
  badge?: ReactNode;
  priority?: boolean;
  sizes?: string;
  titleLines?: 1 | 2;
  overlay?: ReactNode;
  showPlayOverlay?: boolean;
}) {
  return <>
    <span className={`media-tile-art ${aspect === "poster" ? "tile aspect-[2/3]" : "aspect-video"}`}>
      <Artwork src={imageUrl} sizes={sizes} priority={priority} fallback={<span className="flex h-full items-center justify-center px-3 text-center text-sm text-text-tertiary">{title}</span>} />
      {(overlay || showPlayOverlay) && (
        <span className="media-tile-play" aria-hidden="true">
          {overlay ?? <Play weight="fill" size={40} />}
        </span>
      )}
      {badge && <span className="media-tile-badge">{badge}</span>}
    </span>
    <span className="media-tile-caption">
      <span className={`media-tile-title ${titleLines === 2 ? "line-clamp-2 whitespace-normal" : ""}`}>{title}</span>
      {meta && <span className="media-tile-meta">{meta}</span>}
    </span>
  </>;
}
