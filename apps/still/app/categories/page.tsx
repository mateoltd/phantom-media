import type { Metadata } from "next";
import { Catalog } from "@/components/library/Catalog";
import { CategoryBrowser } from "@/components/categories/CategoryBrowser";
import { CategoryHeader } from "@/components/categories/CategoryHeader";
import { ResourcePage } from "@/components/resources/ResourcePage";
import { categoryPath } from "@/lib/categories";
import { buildMetadata } from "@/lib/seo";
import { fetchCategoryDirectory, fetchCategoryPage, searchCategories } from "@/lib/twitch/categories";

type Props = { searchParams: Promise<{ game?: string | string[]; id?: string | string[]; q?: string | string[] }> };
const read = (value: unknown) => typeof value === "string" && value.trim().length <= 100 ? value.trim() : "";
/** A failed read is `undefined`, kept apart from a category Twitch says it does not have (`null`). */
const readId = (value: unknown) => typeof value === "string" && /^\d{1,20}$/.test(value) ? value : undefined;
const settle = <T,>(promise: Promise<T>) => promise.catch(() => undefined);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { game, id, q } = await searchParams;
  const name = read(game);
  if (!name) return buildMetadata({ title: "Twitch categories", description: "The most watched categories on Twitch right now, with who is live in each.", path: "/categories", noIndex: Boolean(read(q)) });
  const page = await settle(fetchCategoryPage({ name, id: readId(id) }));
  if (page === null) return buildMetadata({ title: "Category not found", description: "Twitch has no category by that name.", path: "/categories", noIndex: true });
  const title = page?.category.name ?? name;
  return buildMetadata({ title: `${title} on Twitch`, description: `Live ${title} streams, with recent videos and clips from the category.`, path: categoryPath(page?.category ?? name) });
}

export default async function Categories({ searchParams }: Props) {
  const { game, id, q } = await searchParams;
  const name = read(game);
  const page = name ? await settle(fetchCategoryPage({ name, id: readId(id) })) : null;
  if (name && page !== null) {
    // Twitch's own spelling and ID, so the views asked for later are of this category and none that shares its name.
    const anchor = page?.category.name ?? name, scope = { kind: "game" as const, anchor, id: page?.category.id ?? readId(id) };
    return <ResourcePage heading={<CategoryHeader category={page?.category ?? { name }} />}>
      <Catalog key={`${anchor}:${scope.id ?? ""}`} scope={scope} initial={page ? Promise.resolve(page.live) : undefined} />
    </ResourcePage>;
  }

  // A name Twitch does not have is treated as a search for it.
  const term = name || read(q);
  if (term) {
    const matches = await settle(searchCategories(term));
    return <ResourcePage title="Categories" description={name ? `Twitch has no category called “${name}”. These are the closest.` : `Categories matching “${term}”.`}>
      <CategoryBrowser categories={matches ?? []} searched failed={!matches} />
    </ResourcePage>;
  }

  const directory = await settle(fetchCategoryDirectory());
  return <ResourcePage heading={<h1 className="sr-only">Twitch categories</h1>}>
    <CategoryBrowser categories={directory?.categories ?? []} featured={directory?.featured} failed={!directory} />
  </ResourcePage>;
}
