import type { CatalogItem, SliceReceipt } from "./catalog/contracts.ts";

/** A Twitch category as the directory lists it. `viewers` is null when nobody is live in it. */
export interface Category { id: string; name: string; boxArt: string; viewers: number | null }
/** A category on its own page. */
export interface CategoryDetails extends Category { channels: number | null; followers: number | null; tags: string[] }
/** The most watched categories, the first few with the streams leading them. */
export interface CategoryDirectory { featured: (Category & { streams: CatalogItem[] })[]; categories: Category[] }
/** `live` answers the page's opening view, so the browser does not ask for it. */
export interface CategoryPage { category: CategoryDetails; live: SliceReceipt }

/** A category's page. Several categories can share a name, so a known ID travels with it and decides which one opens. */
export const categoryPath = (category: string | { name: string; id?: string }) => typeof category === "string"
  ? `/categories?${new URLSearchParams({ game: category })}`
  : `/categories?${new URLSearchParams({ game: category.name, ...(category.id ? { id: category.id } : {}) })}`;
export const categorySearchPath = (term: string) => `/categories?${new URLSearchParams({ q: term })}`;

/** A stream in the shape the home feed's tile draws. */
export function liveChannel(item: CatalogItem) {
  const login = item.owner ?? "";
  return { id: item.id, login, displayName: item.ownerName || login, stream: { title: item.title, viewersCount: item.views, previewImageURL: item.thumbnail } };
}

/**
 * Twitch's matches in the order to offer them: a category called exactly what was typed first, then the ones
 * being watched, busiest leading, then the rest as Twitch had them. Twitch lists namesakes and long-dead
 * categories among its matches, and a busier near-match must not displace the name that was typed.
 */
export function rankCategories(categories: readonly Category[], typed: string): Category[] {
  const query = typed.trim().toLowerCase();
  const unique = categories.filter((category, index) => categories.findIndex(other => other.id === category.id) === index);
  const tier = (category: Category) => (category.name.trim().toLowerCase() === query ? 0 : 2) + (category.viewers ? 0 : 1);
  return unique.map((category, index) => ({ category, index }))
    .sort((a, b) => tier(a.category) - tier(b.category) || (b.category.viewers ?? 0) - (a.category.viewers ?? 0) || a.index - b.index)
    .map(entry => entry.category);
}
