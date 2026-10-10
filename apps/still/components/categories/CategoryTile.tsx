import Link from "next/link";
import { Artwork } from "@phantom/ui";
import { categoryPath, type Category } from "@/lib/categories";
import { formatCount } from "@/lib/format";

/** A category as its box art, the way a video is its thumbnail. */
export function CategoryTile({ category, eager = false }: { category: Category; eager?: boolean }) {
  return <Link className="still-category-tile media-tile-hit" href={categoryPath(category)} prefetch={false} title={category.name}>
    <span className="media-tile-art still-category-art">
      <Artwork src={category.boxArt} priority={eager} fallback={<span className="still-category-art-fallback">{category.name}</span>} />
    </span>
    <span className="media-tile-caption">
      <span className="media-tile-title">{category.name}</span>
      <span className="media-tile-meta">{category.viewers ? <span className="still-resource-number">{formatCount(category.viewers)} watching</span> : "Nobody live"}</span>
    </span>
  </Link>;
}
