import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { DiscoveryUpstreamError, fetchMoreChannelDiscovery, fetchChannelDiscovery } from "../lib/twitch.ts";
import { buildDiscoveryProfile, rankDiscovery, discoveryHeading, historyPreview, recentChannelLogins } from "../lib/discovery.ts";

afterEach(() => mock.restoreAll());

const channel = (login) => ({ id: login, login, displayName: login, stream: null });

test("an unfinished VOD uses a live preview only for its matching archive", () => {
  const entry = { vodId: "123", previewThumbnailURL: "https://vod-secure.twitch.tv/_404/404_processing_640x360.png" };
  const owner = { ...channel("example"), stream: { archiveVideo: { id: "123" }, previewImageURL: "https://example.com/live.jpg" } };
  assert.equal(historyPreview(entry, owner), "https://example.com/live.jpg");
  assert.equal(historyPreview({ ...entry, vodId: "124" }, owner), undefined);
  assert.equal(historyPreview({ ...entry, previewThumbnailURL: "https://example.com/vod.jpg" }, owner), "https://example.com/vod.jpg");
});

test("recent channels retain recency, normalize duplicates, and bound the lookup", () => {
  const entries = ["Example", "example", "other", "../invalid", "three", "four", "five", "six", "seven"];
  assert.deepEqual(recentChannelLogins(entries.map((channel) => ({ channel }))), ["example", "other", "three", "four", "five", "six"]);
});

const live = (login, game = "Chess", language = "EN", viewers = 100) => ({ ...channel(login), broadcastSettings: { language, game: { name: game } }, stream: { title: "Live", broadcastLanguage: language, game: { name: game }, viewersCount: viewers } });
const connection = (channels) => ({ edges: channels.map((broadcaster) => ({ node: { broadcaster } })) });

test("verified watched categories outweigh a broadcaster's current category and old visits decay", () => {
  const now = Date.now();
  const history = [{ channel: "alpha", vodId: "1", timestamp: now }, { channel: "bravo", vodId: "2", timestamp: now - 30 * 86400000 }];
  const profile = buildDiscoveryProfile(history, [live("alpha", "Just Chatting"), live("bravo", "Minecraft")], [{ id: "1", owner: { login: "alpha" }, game: { name: "Chess" } }], now);
  assert.ok(profile.games.get("Chess") > profile.games.get("Minecraft"));
  assert.equal(profile.games.has("Just Chatting"), false);
  const duplicate = buildDiscoveryProfile([...history, history[0]], [live("alpha")], [], now);
  assert.equal(duplicate.channels.get("alpha"), Math.log(2));
});

test("ranking favors relevance over raw popularity and diversifies the first row", () => {
  const profile = buildDiscoveryProfile([{ channel: "alpha", timestamp: Date.now() }], [live("alpha")]);
  const pool = [
    ...["chessone", "chesstwo", "chessthree", "chessfour"].map((login) => ({ channel: live(login), source: "category" })),
    { channel: live("french", "Chess", "FR", 500000), source: "directory" },
    { channel: live("variety", "Music", "EN", 1000), source: "directory" },
    { channel: live("alpha"), source: "category" },
  ];
  const result = rankDiscovery(pool, profile, ["alpha"], 4);
  assert.equal(result[0].stream.game.name, "Chess");
  assert.ok(result.some((item) => item.login === "variety"));
  assert.ok(!result.some((item) => ["alpha", "french"].includes(item.login)));
});

test("offline team suggestions retain their truthful connection reason", () => {
  const profile = buildDiscoveryProfile([], [live("alpha")]);
  const [result] = rankDiscovery([{ channel: channel("teammate"), source: "team", seed: "alpha" }], profile);
  assert.equal(result.stream, null);
  assert.equal(result.recommendation.reason, "On the same Twitch team as alpha");
  assert.equal(discoveryHeading("SIMILAR_SECTION", "alpha"), "Suggested for alpha");
});

test("API combines live directory, verified team and offline archive candidates without false viewer claims", async () => {
  const calls = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    const { query, variables } = JSON.parse(init.body); calls.push({ query, variables });
    let data;
    if (query.includes("query RecentChannels")) data = { users: [live("integration", "Chess", "ES")] };
    else if (query.includes("query DiscoveryDirectory")) data = { streams: connection([live("discovery", "Music", "ES")]) };
    else if (query.includes("query DiscoveryCategory")) data = { game: { streams: connection([live("chesslive", "Chess", "ES")]), videos: { edges: [{ node: { owner: channel("archiveowner") } }] } } };
    else data = { personalSections: [{ type: "POPULAR_SECTION", items: [{ user: live("unrelated") }] }], user: { primaryTeam: { members: { edges: [{ node: channel("teammate") }] } } } };
    return Response.json({ data });
  });
  const result = await fetchChannelDiscovery(["integration"]);
  const all = result.sections.flatMap((section) => section.channels);
  assert.ok(all.some((item) => item.login === "discovery"));
  assert.ok(all.some((item) => item.login === "teammate"));
  assert.ok(all.some((item) => item.login === "archiveowner"));
  assert.ok(!all.some((item) => item.login === "unrelated"));
  assert.equal(new Set(all.map((item) => item.login)).size, all.length);
  assert.deepEqual(calls.find((call) => call.query.includes("query DiscoveryDirectory")).variables.languages, ["ES"]);
  assert.ok(calls.every((call) => !call.query.includes("first: 60")));
  const count = calls.length;
  await fetchChannelDiscovery(["integration"]);
  assert.equal(calls.length, count, "cached public lookups avoid redundant requests");
});

test("total discovery failure propagates an upstream error", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => {
    const { query } = JSON.parse(init.body);
    return Response.json(query.includes("query RecentChannels") ? { data: { users: [channel("failurecase")] } } : { errors: [{ message: "Unsupported query" }] });
  });
  await assert.rejects(fetchChannelDiscovery(["failurecase"]), (error) => error.status === 502 && error.retryAfter === 15);
});

test("a successful related source preserves useful partial results when the directory fails", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes("query RecentChannels")) return Response.json({ data: { users: [channel("partialseed")] } });
    if (query.includes("query RelatedChannels")) return Response.json({ data: { user: { primaryTeam: { members: { edges: [{ node: live("partialfriend") }] } } } } });
    return new Response(null, { status: 503 });
  });
  const result = await fetchChannelDiscovery(["partialseed"]);
  assert.equal(result.recent[0].login, "partialseed");
  assert.equal(result.sections[0].channels[0].login, "partialfriend");
});

test("new visitors receive a accurately labelled live directory without profile lookups", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ data: { streams: connection([live("newvisitor")]) } });
  });
  const result = await fetchChannelDiscovery([]);
  assert.equal(calls, 1);
  assert.equal(result.sections[0].type, "POPULAR_SECTION");
  assert.equal(result.sections[0].channels[0].login, "newvisitor");
});

test("a broad category does not crowd verified channel connections out of the first row", () => {
  const profile = buildDiscoveryProfile([], [live("seedchannel", "Just Chatting", "ES")]);
  const candidates = ["broadone", "broadtwo", "broadthree", "broadfour"].map((login) => ({ channel: live(login, "Just Chatting", "ES", 5000), source: "category" }));
  candidates.push({ channel: live("connected", "Minecraft", "ES", 100), source: "team", seed: "seedchannel" });
  candidates.push({ channel: live("variety", "Music", "ES", 2000), source: "directory" });
  const first = rankDiscovery(candidates, profile, [], 4);
  assert.equal(first[0].login, "connected");
  assert.ok(first.filter((item) => item.stream.game.name === "Just Chatting").length <= 2);
});

test("continuations use a single cursor lookup, coalesce concurrent callers, deduplicate and stop at the end", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    calls += 1;
    const { query, variables } = JSON.parse(init.body);
    assert.ok(query.includes("first: 30, after: $after"));
    assert.equal(variables.after, "page-two-test");
    assert.deepEqual(variables.languages, ["DE"]);
    return Response.json({ data: { streams: { edges: [
      { cursor: "end", node: { broadcaster: live("german", "Chess", "DE") } },
      { cursor: "end", node: { broadcaster: live("german", "Chess", "DE") } },
    ], pageInfo: { hasNextPage: false } } } });
  });
  const pages = await Promise.all([fetchMoreChannelDiscovery("page-two-test", ["DE"]), fetchMoreChannelDiscovery("page-two-test", ["DE"])]);
  assert.equal(calls, 1);
  assert.equal(pages[0].channels.length, 1);
  assert.equal(pages[0].next, undefined);
  assert.match(pages[0].channels[0].recommendation.reason, /German/);
});

test("continuations carry the final Twitch cursor forward and reject a nonadvancing cursor", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => {
    const { variables } = JSON.parse(init.body);
    return Response.json({ data: { streams: { edges: [{ cursor: "cursor-next", node: { broadcaster: live("nextchannel") } }], pageInfo: { hasNextPage: true } } } });
  });
  const page = await fetchMoreChannelDiscovery("cursor-first", ["IT"]);
  assert.deepEqual(page.next, { cursor: "cursor-next", languages: ["IT"] });
  assert.equal((await fetchMoreChannelDiscovery("cursor-next", ["IT"])).next, undefined);
});

test("a failed continuation returns a retryable upstream error without retrying Twitch", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls += 1; return new Response(null, { status: 503 }); });
  await assert.rejects(fetchMoreChannelDiscovery("failed-page", ["PT"]), (error) => error instanceof DiscoveryUpstreamError && error.status === 502 && error.retryAfter === 15);
  assert.equal(calls, 1);
});

test("source plans expand an unused recent category with one query and end without fake pagination", async () => {
  let requests = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests += 1;
    const { query } = JSON.parse(init.body);
    let data = {};
    if (query.includes("query RecentChannels")) data = { users: [live("expansionseed", "Music", "JA")] };
    else if (query.includes("query WatchedCategories")) data = { v0: { id: "987654", owner: { login: "expansionseed" }, game: { name: "Chess" } } };
    else if (query.includes("query DiscoveryExpansionCategory")) data = { game: { streams: connection([live("newmusic", "Music", "JA")]) } };
    return Response.json({ data });
  });
  const initial = await fetchChannelDiscovery(["expansionseed"], [{ channel: "expansionseed", vodId: "987654", timestamp: Date.now() }]);
  assert.match(initial.next.cursor, /^plan_/);
  const previous = requests;
  const page = await fetchMoreChannelDiscovery(initial.next.cursor, initial.next.languages);
  assert.equal(requests, previous + 1);
  assert.equal(page.channels[0].login, "newmusic");
  assert.equal(page.next, undefined);
  await fetchMoreChannelDiscovery(initial.next.cursor, initial.next.languages);
  assert.equal(requests, previous + 1, "repeating the same source uses the shared cache");
});

test("integrity restrictions are terminal rather than automatically retried", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls += 1; return Response.json({ errors: [{ message: "failed integrity check", extensions: { code: "IntegrityCheckFailed" } }] }); });
  await assert.rejects(fetchMoreChannelDiscovery("integrity-test", ["KO"]), (error) => error.status === 403 && error.retryAfter === 0);
  assert.equal(calls, 1);
});

test("429 cooldown prevents repeated scroll calls from sending more Twitch requests", async () => {
  let calls = 0;
  const now = Date.now();
  mock.method(Date, "now", () => now);
  mock.method(globalThis, "fetch", async () => { calls += 1; return new Response(null, { status: 429, headers: { "Retry-After": "45" } }); });
  await assert.rejects(fetchMoreChannelDiscovery("limited-page", ["FR"]), (error) => error.status === 429 && error.retryAfter === 45);
  await assert.rejects(fetchMoreChannelDiscovery("another-page", ["FR"]), (error) => error.status === 429);
  assert.equal(calls, 1);
  mock.method(Date, "now", () => now + 46000);
  mock.method(globalThis, "fetch", async () => { calls += 1; return Response.json({ data: { streams: { edges: [], pageInfo: { hasNextPage: false } } } }); });
  assert.deepEqual(await fetchMoreChannelDiscovery("after-cooldown", ["FR"]), { channels: [] });
  assert.equal(calls, 2);
});


test("initial discovery prioritizes 429 when every discovery source fails", async () => {
  // Advance beyond the cooldown exercised by the previous test.
  const now = Date.now() + 120000;
  mock.method(Date, "now", () => now);
  mock.method(globalThis, "fetch", async (_url, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes("query RecentChannels")) return Response.json({ data: { users: [live("initiallimited", "Chess", "RU")] } });
    if (query.includes("query DiscoveryDirectory")) return new Response(null, { status: 429, headers: { "Retry-After": "45" } });
    return new Response(null, { status: 503 });
  });
  await assert.rejects(fetchChannelDiscovery(["initiallimited"]), (error) => error instanceof DiscoveryUpstreamError && error.status === 429 && error.retryAfter === 45);
});
