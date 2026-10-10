import { runQuery } from "./gql.ts";
import { STREAM_FIELDS, streamItems, type StreamConnection } from "./catalogs.ts";
import { DEFAULT_LIVE_VIEW, VIEW_SIZE, viewSlice } from "../catalog/slices.ts";
import type { Category, CategoryDirectory, CategoryPage } from "../categories.ts";

const CATEGORY_FIELDS = "id name viewersCount boxArtURL(width:285,height:380)";
interface GameNode { id: string; name: string; viewersCount?: number | null; boxArtURL?: string | null; broadcastersCount?: number | null; followersCount?: number | null; tags?: { localizedName?: string }[] | null; streams?: StreamConnection | null }
interface GameConnection { edges?: { node?: GameNode | null }[] | null }

const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const category = (node: GameNode): Category => ({ id: node.id, name: node.name, boxArt: node.boxArtURL ?? "", viewers: count(node.viewersCount) });
const games = (connection?: GameConnection | null) => (connection?.edges ?? []).flatMap(({ node }) => node && typeof node.id === "string" && typeof node.name === "string" ? [node] : []);
const READ = { discovery: true, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 };

/** How many categories open the directory with their streams, and how many streams each shows. */
const FEATURED = 3, FEATURED_STREAMS = 24;

/** The directory in one request: the hundred most watched categories, the leading few with their top streams. */
export async function fetchCategoryDirectory(): Promise<CategoryDirectory> {
  const data = await runQuery<{ featured?: GameConnection | null; games?: GameConnection | null }>(`query CategoryDirectory {
    featured: games(first: ${FEATURED}, options: { sort: VIEWER_COUNT }) { edges { node { ${CATEGORY_FIELDS} streams(first: ${FEATURED_STREAMS}) { edges { node { ${STREAM_FIELDS} } } } } } }
    games(first: 100, options: { sort: VIEWER_COUNT }) { edges { node { ${CATEGORY_FIELDS} } } }
  }`, undefined, READ);
  return {
    featured: games(data.featured).map(node => ({ ...category(node), streams: streamItems(node.streams) })).filter(entry => entry.streams.length > 0),
    categories: games(data.games).map(category),
  };
}

/**
 * A category and who is live in it, in one request. Null when Twitch has no such category.
 * An ID is exact; a name alone opens whichever category Twitch resolves it to.
 */
export async function fetchCategoryPage({ name, id }: { name: string; id?: string }): Promise<CategoryPage | null> {
  const query = `query CategoryPage(${id ? "$id: ID!" : "$name: String!"}, $first: Int!) { game(${id ? "id: $id" : "name: $name"}) {
    ${CATEGORY_FIELDS} broadcastersCount followersCount tags(tagType: CONTENT) { localizedName }
    streams(first: $first, options: { sort: VIEWER_COUNT }) { edges { node { ${STREAM_FIELDS} } } }
  } }`;
  const data = await runQuery<{ game?: GameNode | null }>(query, { ...(id ? { id } : { name }), first: VIEW_SIZE }, READ);
  const game = data.game;
  if (!game || typeof game.id !== "string" || typeof game.name !== "string") return null;
  return {
    category: { ...category(game), channels: count(game.broadcastersCount), followers: count(game.followersCount),
      tags: (game.tags ?? []).flatMap(tag => typeof tag?.localizedName === "string" && tag.localizedName ? [tag.localizedName] : []).slice(0, 6) },
    live: { slice: viewSlice({ kind: "game", anchor: game.name, id: game.id }, DEFAULT_LIVE_VIEW), items: streamItems(game.streams), fetchedAt: Date.now(), bytes: JSON.stringify(data).length },
  };
}

/** Categories matching what was typed. Twitch's own search forgives typos and partial names. */
export async function searchCategories(term: string): Promise<Category[]> {
  const data = await runQuery<{ searchCategories?: GameConnection | null }>(
    `query CategorySearch($term: String!) { searchCategories(query: $term, first: 24) { edges { node { ${CATEGORY_FIELDS} } } } }`, { term }, READ);
  return games(data.searchCategories).map(category);
}
