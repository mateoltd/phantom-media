import { runQuery } from "./gql.ts";
import { UpstreamError } from "../errors.ts";
import { validateSlice, sliceKey } from "../catalog/slices.ts";
import type { CatalogSlice, CatalogItem, SliceReceipt } from "../catalog/contracts.ts";
import { ResourceCache } from "../cache.ts";
const slices = new ResourceCache<SliceReceipt>(48, 8 * 1024 * 1024, value => value.bytes * 2);
const VIDEO_FIELDS = "id title createdAt lengthSeconds viewCount broadcastType previewThumbnailURL(width:640,height:360) owner { login }";
const CLIP_FIELDS = "id slug title createdAt durationSeconds viewCount thumbnailURL broadcaster { login }";
interface Node { id: string; slug?: string; title: string; createdAt: string; lengthSeconds?: number; durationSeconds?: number; viewCount: number; previewThumbnailURL?: string; thumbnailURL?: string; owner?: { login: string }; broadcaster?: { login: string } }
export const STREAM_FIELDS = "id title viewersCount createdAt previewImageURL(width:640,height:360) broadcaster { login displayName }";
interface StreamNode { id: string; title?: string | null; viewersCount?: number | null; createdAt?: string | null; previewImageURL?: string | null; broadcaster?: { login: string; displayName?: string | null } | null }
export interface StreamConnection { edges?: { node?: StreamNode | null }[] | null }
/** Streams as catalog items. A stream whose channel Twitch withholds has nowhere to lead, so it is dropped. */
export function streamItems(connection?: StreamConnection | null): CatalogItem[] {
  return (connection?.edges ?? []).flatMap(({ node }) => {
    if (!node || typeof node.id !== "string" || typeof node.broadcaster?.login !== "string") return [];
    const owner = node.broadcaster.login;
    return [{ kind: "live", id: node.id, title: node.title ?? "", createdAt: node.createdAt ?? "", duration: 0, views: node.viewersCount ?? 0, thumbnail: node.previewImageURL ?? "", owner, ownerName: node.broadcaster.displayName || owner }];
  });
}
/** A category is asked for by ID when the slice has one: several categories can share a name. */
const gameRoot = (slice: CatalogSlice) => slice.id ? { declaration: "$id:ID!", root: "game(id:$id)", variables: { id: slice.id } } : { declaration: "$anchor:String!", root: "game(name:$anchor)", variables: { anchor: slice.anchor } };
async function fetchStreams(slice: CatalogSlice): Promise<SliceReceipt> {
  const game = gameRoot(slice);
  const query = `query CategoryStreams(${game.declaration}, $first:Int!, $languages:[Language!]) { ${game.root} { streams(first:$first, options:{sort:${slice.sort}, broadcasterLanguages:$languages}) { edges { node { ${STREAM_FIELDS} } } } } }`;
  const data = await runQuery<{ game?: { streams?: StreamConnection | null } | null }>(query, { ...game.variables, first: slice.first, languages: slice.language ? [slice.language] : null }, { discovery: true, timeoutMs: 20_000, maxBytes: 2 * 1024 * 1024 });
  if (!data.game) throw new UpstreamError("not-found");
  if (!data.game.streams || !Array.isArray(data.game.streams.edges)) throw new UpstreamError("schema");
  return { slice, items: streamItems(data.game.streams), fetchedAt: Date.now(), bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength };
}
export function fetchCatalogSlice(input: CatalogSlice, signal?: AbortSignal): Promise<SliceReceipt> {
  const slice = validateSlice(input);
  return slices.load(sliceKey(slice), async () => {
    if (slice.source === "game-streams") return fetchStreams(slice);
    const clips = slice.source.endsWith("clips"), game = slice.source.startsWith("game");
    const name = game ? clips ? "CategoryClips" : "CategoryVideos" : clips ? "ChannelClips" : "ChannelVideos";
    const anchor = game ? gameRoot(slice) : { declaration: "$anchor:String!", root: "user(login:$anchor)", variables: { anchor: slice.anchor } };
    const root = anchor.root;
    const declarations = game ? clips ? ", $languages: [Language!]" : ", $language: [String!]" : "";
    const args = clips ? `first:$first, criteria:{period:${slice.period}, sort:TRENDING${game ? ", languages:$languages" : ""}}` : `first:$first, sort:${slice.sort}${game ? ", languages:$language" : slice.type ? `, type:${slice.type}` : ""}`;
    const query = `query ${name}(${anchor.declaration}, $first:Int!${declarations}) { ${root} { ${clips ? "clips" : "videos"}(${args}) { ${!clips && !game ? "totalCount" : ""} edges { node { ${clips ? CLIP_FIELDS : VIDEO_FIELDS} } } } } }`;
    const variables = { ...anchor.variables, first: slice.first, ...(game ? clips ? { languages: slice.language ? [slice.language] : null } : { language: slice.language ? [slice.language] : null } : {}) };
    const data = await runQuery<Record<string, Record<string, { edges: { node: Node }[]; totalCount?: unknown }> | null>>(query, variables, { discovery: true, timeoutMs: slice.first > 500 ? 45_000 : 20_000, maxBytes: slice.first > 500 ? 8 * 1024 * 1024 : 2 * 1024 * 1024 });
    const owner = data[game ? "game" : "user"];
    if (!owner) throw new UpstreamError("not-found");
    const connection = owner[clips ? "clips" : "videos"];
    if (!connection || !Array.isArray(connection.edges)) throw new UpstreamError("schema");
    const items: CatalogItem[] = connection.edges.flatMap(({ node }) => {
      if (!node || typeof node.id !== "string" || typeof node.title !== "string") return [];
      return [{ kind: clips ? "clip" : "vod", id: node.id, slug: node.slug, title: node.title, createdAt: node.createdAt, duration: node.lengthSeconds ?? node.durationSeconds ?? 0, views: node.viewCount ?? 0, thumbnail: node.previewThumbnailURL ?? node.thumbnailURL ?? "", owner: node.owner?.login ?? node.broadcaster?.login }];
    });
    const totalCount = !clips && !game && Number.isSafeInteger(connection.totalCount) && Number(connection.totalCount) >= 0 ? Number(connection.totalCount) : undefined;
    return { slice, items, fetchedAt: Date.now(), bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength, totalCount };
  }, 60_000, signal);
}
/** The first view, read while the page renders. A slow or failed read is not an error here:
 * the page ships without it and the browser asks for the same slice, joining this load if it is still running. */
export function seedCatalog(slice: CatalogSlice, patienceMs = 2500): Promise<SliceReceipt | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    fetchCatalogSlice(slice).catch(() => null),
    new Promise<null>(resolve => { timer = setTimeout(resolve, patienceMs, null); }),
  ]).finally(() => clearTimeout(timer));
}
