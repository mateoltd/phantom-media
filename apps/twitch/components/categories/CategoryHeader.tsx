import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import { Artwork } from "@phantom/ui";
import type { CategoryDetails } from "@/lib/categories";
import { formatCount } from "@/lib/format";

/**
 * A category's box art beside its name and how busy it is. `category` may be only a name, when Twitch
 * could not be asked for the rest: the page still opens and its streams are fetched by the browser.
 */
export function CategoryHeader({ category }: { category: Pick<CategoryDetails, "name"> & Partial<CategoryDetails> }) {
  const stats = [
    { value: category.viewers, label: "watching" },
    { value: category.channels, label: category.channels === 1 ? "channel live" : "channels live" },
    { value: category.followers, label: category.followers === 1 ? "follower" : "followers" },
  ].flatMap(stat => typeof stat.value === "number" ? [{ ...stat, value: stat.value }] : []);
  return <header className="twitch-category-header">
    {category.boxArt && <span className="media-tile-art twitch-category-art twitch-category-header-art"><Artwork src={category.boxArt} priority /></span>}
    <div className="twitch-category-names">
      <Link href="/categories" className="twitch-category-back"><CaretLeft size={12} weight="bold" aria-hidden="true" />Categories</Link>
      <h1 className="twitch-category-name">{category.name}</h1>
      {stats.length > 0 && <p className="twitch-category-stats">{stats.map(stat => <span key={stat.label}><strong>{formatCount(stat.value)}</strong> {stat.label}</span>)}</p>}
      {!!category.tags?.length && <div className="twitch-content-labels" aria-label="Genres">{category.tags.map(tag => <span key={tag} className="twitch-content-label">{tag}</span>)}</div>}
    </div>
  </header>;
}
