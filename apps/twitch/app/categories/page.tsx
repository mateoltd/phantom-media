import { Catalog } from "@/components/library/Catalog";
import { ResourcePage, ResourceNotice } from "@/components/resources/ResourcePage";
import { ResourceSearch } from "@/components/resources/ResourceSearch";
import { DEFAULT_VIEW, viewSlice } from "@/lib/catalog/slices";
import { seedCatalog } from "@/lib/twitch/catalogs";

export default async function Categories({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  const name = typeof game === "string" && game.trim().length <= 100 ? game.trim() : "";
  return <ResourcePage title={name || "Categories"} description={name ? "Videos and clips from this category." : "Find videos and clips by category."}>
    <ResourceSearch key={`search:${name}`} path="/categories" parameter="game" initialValue={name} placeholder="Find a category" submit="Open category" />
    {name ? <Catalog key={`catalog:${name}`} scope={{ kind: "game", anchor: name }} initial={seedCatalog(viewSlice({ kind: "game", anchor: name }, DEFAULT_VIEW))} />
      : <ResourceNotice title="Choose a category">Try Just Chatting, Minecraft, or Chess.</ResourceNotice>}
  </ResourcePage>;
}
