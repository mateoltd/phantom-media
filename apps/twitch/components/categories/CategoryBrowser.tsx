import type { Category, CategoryDirectory } from "@/lib/categories";
import { ResourceNotice } from "../resources/ResourcePage";
import { CategoryShelf } from "./CategoryShelf";
import { CategoryTile } from "./CategoryTile";

/**
 * Categories as box art. Each `featured` one first gets a row of its own: its box art, then a carousel of its streams. Finding a category by name is the
 * header search's job, so this is the same list whether it is the directory or the answer to a search (`searched`).
 */
export function CategoryBrowser({ categories, featured = [], searched = false, failed = false }: {
  categories: Category[]; featured?: CategoryDirectory["featured"]; searched?: boolean; failed?: boolean;
}) {
  // The shelves are the top of the same list, so the grid under them carries on from where they stop.
  const listed = featured.length ? categories.filter(category => !featured.some(shelf => shelf.id === category.id)) : categories;
  return <>
    {featured.map(shelf => <CategoryShelf key={shelf.id} shelf={shelf} />)}
    {featured.length > 0 && listed.length > 0 && <h2 className="twitch-category-more">More categories</h2>}
    {listed.length > 0 ? <div className="twitch-category-grid">
      {listed.map((category, index) => <CategoryTile key={category.id} category={category} eager={index < 8} />)}
    </div>
      : failed ? <ResourceNotice title="Categories didn’t load" error>Twitch didn’t answer. Try again in a moment.</ResourceNotice>
      : searched ? <ResourceNotice title="No category matches">Check the spelling, or try fewer words.</ResourceNotice>
      : null}
  </>;
}
