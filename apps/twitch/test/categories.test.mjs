import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { DEFAULT_LIVE_VIEW, validateSlice, viewSlice, sliceKey } from "../lib/catalog/slices.ts";
import { categoryPath, categorySearchPath, rankCategories } from "../lib/categories.ts";
import { fetchCatalogSlice } from "../lib/twitch/catalogs.ts";
import { fetchCategoryDirectory, fetchCategoryPage, searchCategories } from "../lib/twitch/categories.ts";

// Each test gets its own minute, so nothing is answered from another test's cache.
let clockStep = 0;
const origin = Date.now();
beforeEach(() => mock.method(Date, "now", () => origin + clockStep * 600000));
afterEach(() => { mock.restoreAll(); clockStep++; });

const stream = (id, login, viewers = 10) => ({ id, title: `${login} live`, viewersCount: viewers, createdAt: "2026-10-10T12:00:00Z", previewImageURL: `https://example.com/${login}.jpg`, broadcaster: { login, displayName: login.toUpperCase() } });
const game = (id, name, viewers = 100, extra = {}) => ({ id, name, viewersCount: viewers, boxArtURL: `https://example.com/${id}.jpg`, ...extra });
const edges = (nodes) => ({ edges: nodes.map((node) => ({ node })) });
const answer = (data) => { const requests = []; mock.method(globalThis, "fetch", async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ data }); }); return requests; };

test("category links carry the name as a query", () => {
  assert.equal(categoryPath("Tom Clancy's Rainbow Six & Co"), "/categories?game=Tom+Clancy%27s+Rainbow+Six+%26+Co");
  assert.equal(categorySearchPath("leage of"), "/categories?q=leage+of");
  // Several categories are called Chess. The ID is what tells them apart.
  assert.equal(categoryPath({ name: "Chess", id: "511910411" }), "/categories?game=Chess&id=511910411");
  assert.notEqual(categoryPath({ name: "Chess", id: "511910411" }), categoryPath({ name: "Chess", id: "743" }));
});

test("a category with a known ID is asked for by ID in every view", async () => {
  const scope = { kind: "game", anchor: "Chess", id: "511910411" };
  assert.deepEqual(viewSlice(scope, DEFAULT_LIVE_VIEW), { source: "game-streams", anchor: "Chess", first: 100, sort: "VIEWER_COUNT", id: "511910411" });
  assert.notEqual(sliceKey(viewSlice(scope, DEFAULT_LIVE_VIEW)), sliceKey(viewSlice({ ...scope, id: "743" }, DEFAULT_LIVE_VIEW)));
  assert.throws(() => validateSlice({ source: "game-streams", anchor: "Chess", first: 100, sort: "RECENT", id: "743 or 1" }));
  assert.throws(() => validateSlice({ source: "channel-videos", anchor: "fixturechannel", first: 100, sort: "TIME", id: "743" }));
  for (const view of [DEFAULT_LIVE_VIEW, { ...DEFAULT_LIVE_VIEW, media: "vod" }, { ...DEFAULT_LIVE_VIEW, media: "clip" }]) {
    const requests = answer({ game: { streams: edges([]), videos: edges([]), clips: edges([]) } });
    await fetchCatalogSlice(viewSlice(scope, view));
    assert.ok(requests[0].query.includes("game(id:$id)"), view.media);
    assert.ok(!requests[0].query.includes("$anchor"), view.media);
    assert.equal(requests[0].variables.id, "511910411");
    mock.restoreAll();
    mock.method(Date, "now", () => origin + clockStep * 600000);
  }
});

test("a category page opened by ID reads that category and keeps its ID for later views", async () => {
  const requests = answer({ game: game("511910411", "Chess", 18, { streams: edges([stream("9", "gamma")]) }) });
  const page = await fetchCategoryPage({ name: "Chess", id: "511910411" });
  assert.deepEqual(requests[0].variables, { id: "511910411", first: 100 });
  assert.ok(requests[0].query.includes("game(id: $id)"));
  assert.equal(page.live.slice.id, "511910411");
});

test("a category's live view is one bounded slice with its own axes", () => {
  const scope = { kind: "game", anchor: "Chess" };
  assert.deepEqual(viewSlice(scope, DEFAULT_LIVE_VIEW), { source: "game-streams", anchor: "Chess", first: 100, sort: "VIEWER_COUNT" });
  assert.deepEqual(viewSlice(scope, { ...DEFAULT_LIVE_VIEW, order: "RECENT", language: "de" }), { source: "game-streams", anchor: "Chess", first: 100, sort: "RECENT", language: "DE" });
  assert.throws(() => validateSlice({ source: "game-streams", anchor: "Chess", first: 100, sort: "TIME" }));
  assert.throws(() => validateSlice({ source: "game-streams", anchor: "Chess", first: 100, sort: "RECENT", language: "de" }));
  assert.throws(() => validateSlice({ source: "game-streams", anchor: "Chess", first: 100, sort: "RECENT", period: "LAST_DAY" }));
  assert.throws(() => validateSlice({ source: "game-streams", anchor: "Chess", first: 101, sort: "RECENT" }));
});

test("live streams are read without a cursor and a withheld channel is dropped", async () => {
  const requests = answer({ game: { streams: edges([stream("1", "alpha", 50), { ...stream("2", "beta"), broadcaster: null }]) } });
  const receipt = await fetchCatalogSlice(viewSlice({ kind: "game", anchor: "Chess" }, { ...DEFAULT_LIVE_VIEW, language: "fr" }));
  assert.equal(requests.length, 1);
  assert.ok(!requests[0].query.includes("after"));
  assert.ok(requests[0].query.includes("sort:VIEWER_COUNT"));
  assert.deepEqual(requests[0].variables, { anchor: "Chess", first: 100, languages: ["FR"] });
  assert.deepEqual(receipt.items, [{ kind: "live", id: "1", title: "alpha live", createdAt: "2026-10-10T12:00:00Z", duration: 0, views: 50, thumbnail: "https://example.com/alpha.jpg", owner: "alpha", ownerName: "ALPHA" }]);
});

test("a category page answers its opening live view in the same request", async () => {
  const requests = answer({ game: game("743", "Chess", 1800, { broadcastersCount: 78, followersCount: 2685145, tags: [{ localizedName: "Strategy" }, { localizedName: "" }], streams: edges([stream("1", "alpha")]) }) });
  const page = await fetchCategoryPage({ name: "chess" });
  assert.equal(requests.length, 1);
  assert.deepEqual(page.category, { id: "743", name: "Chess", boxArt: "https://example.com/743.jpg", viewers: 1800, channels: 78, followers: 2685145, tags: ["Strategy"] });
  // Keyed by Twitch's spelling, so the catalog on the page never asks for this view again.
  assert.equal(sliceKey(page.live.slice), sliceKey(viewSlice({ kind: "game", anchor: "Chess", id: "743" }, DEFAULT_LIVE_VIEW)));
  assert.equal(page.live.items[0].owner, "alpha");
});

test("a name Twitch does not have is a miss, not a failure", async () => {
  answer({ game: null });
  assert.equal(await fetchCategoryPage({ name: "Nope" }), null);
});

test("the directory is one request and only features categories that have streams to show", async () => {
  const requests = answer({
    featured: edges([game("1", "Just Chatting", 300, { streams: edges([stream("1", "alpha")]) }), game("2", "Quiet", 200, { streams: edges([]) })]),
    games: edges([game("1", "Just Chatting", 300), game("2", "Quiet", 200), game("3", "Chess", null), null]),
  });
  const directory = await fetchCategoryDirectory();
  assert.equal(requests.length, 1);
  assert.deepEqual(directory.featured.map((entry) => [entry.name, entry.streams.length]), [["Just Chatting", 1]]);
  assert.deepEqual(directory.categories.map((entry) => [entry.name, entry.viewers]), [["Just Chatting", 300], ["Quiet", 200], ["Chess", null]]);
});

test("category search passes the typed text as a variable", async () => {
  const requests = answer({ searchCategories: edges([game("21779", "League of Legends", 150000)]) });
  const matches = await searchCategories('leage "of" legends');
  assert.deepEqual(requests[0].variables, { term: 'leage "of" legends' });
  assert.ok(!requests[0].query.includes("leage"));
  assert.equal(matches[0].name, "League of Legends");
});

test("the name that was typed outranks a busier near-match, and namesakes stay apart", () => {
  const found = [game("2042681592", "Minecraft Dungeons II", 2702), game("509725", "Minecraft Dungeons", 29), game("1", "Minecraft Dungeons Arcade", null), game("509725", "Minecraft Dungeons", 29)]
    .map((node) => ({ id: node.id, name: node.name, boxArt: "", viewers: node.viewersCount }));
  assert.deepEqual(rankCategories(found, " minecraft dungeons ").map((entry) => entry.id), ["509725", "2042681592", "1"]);
  // With nothing typed exactly, the watched ones lead by viewers and the quiet ones keep Twitch's order.
  assert.deepEqual(rankCategories(found, "minecraft dung").map((entry) => entry.id), ["2042681592", "509725", "1"]);
  const chess = [{ id: "511910411", name: "Chess", boxArt: "", viewers: 18 }, { id: "9", name: "Chess", boxArt: "", viewers: null }, { id: "743", name: "Chess", boxArt: "", viewers: 1800 }];
  assert.deepEqual(rankCategories(chess, "chess").map((entry) => entry.id), ["743", "511910411", "9"]);
});
