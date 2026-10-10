import assert from "node:assert/strict";
import { test, afterEach, mock } from "node:test";
import { ChannelSearchIndex, normalizeSearch } from "../lib/search/ranking.ts";
import { SEARCH_SEEDS } from "../lib/search/seeds.ts";
import { readSearchChannels, observedChannel } from "../lib/search/contracts.ts";
import { readFileSync } from "node:fs";
import { searchChannels } from "../lib/search/service.ts";
import { execute } from "../lib/twitch/gql.ts";
import { channelIndex } from "../lib/search/registry.ts";
import { parseCandidates, searchCandidates } from "../lib/search/candidates.ts";
import { parseAutocomplete, autocompleteChannels } from "../lib/search/autocomplete.ts";
const candidateFixture = term => JSON.parse(readFileSync(new URL(`./fixtures/search/candidates-${term}.json`, import.meta.url)));
const now = Date.now();
const channel = (login, extras = {}) => ({ login, displayName: login, ...extras });
const popularity = JSON.parse(readFileSync(new URL("./fixtures/search/popularity.json", import.meta.url)));
afterEach(() => mock.restoreAll());

test("partial login, display-name words, accents, separators and transpositions find channels", () => {
  const index = new ChannelSearchIndex(); index.put(SEARCH_SEEDS);
  for (const [query, expected] of [["rub", "rubius"], ["aur", "auronplay"], ["rubuis", "rubius"], ["ricky edit", "rickyedit"], ["caseoh", "caseoh_"], ["el xokas", "elxokas"]]) {
    assert.equal(index.search(query)[0]?.login, expected, query);
  }
  index.put([channel("localfixture", { displayName: "José García" })]);
  for (const query of ["jose", "garc", "jose gar", "@jósé"]) assert.equal(index.search(query)[0].login, "localfixture", query);
  assert.equal(normalizeSearch("  José___García "), "jose garcia");
});

test("a full popular identity stays above extensions; live and history rank comparable names", () => {
  const index = new ChannelSearchIndex();
  index.put([channel("rubius", { followerCount: 2_000_000, isPartner: true, popularityObservedAt: now }), channel("rubiuslive", { isLive: true, viewersCount: 1_000_000, observedAt: now }), channel("rubiuslocal")]);
  assert.equal(index.search("rubius", [{ channel: "rubiuslive", timestamp: now }], 8, now)[0].login, "rubius");
  assert.equal(index.search("rub", [], 8, now)[0].login, "rubius", "an offline established creator can outrank a live namesake");
  const live = new ChannelSearchIndex(); live.put([channel("match_a"), channel("match_b", { isLive: true, viewersCount: 50_000, observedAt: now })]);
  assert.equal(live.search("match", [], 8, now)[0].login, "match_b");
  const affinity = new ChannelSearchIndex(); affinity.put([channel("small_a"), channel("small_b")]);
  assert.equal(affinity.search("small", [{ channel: "small_b", timestamp: now }], 8, now)[0].login, "small_b");
  index.put([channel("unrelated", { isLive: true, viewersCount: 100_000_000, observedAt: now })]);
  assert.ok(!index.search("rub").some(x => x.login === "unrelated"));
});

test("receipt-backed broad illo searches prefer IlloJuan while retaining the exact small account", () => {
  const index = new ChannelSearchIndex(); index.put(popularity.response.data.users.map(user => observedChannel(user, now)));
  assert.equal(index.search("illo", [], 8, now)[0].login, "illojuan");
  assert.equal(index.search("illoju", [], 8, now)[0].login, "illojuan");
  assert.equal(index.search("illojuan", [], 8, now)[0].login, "illojuan");
  assert.ok(index.search("illo", [], 8, now).some(channel => channel.login === "illo"));
  assert.ok(index.search("illo", [], 8, now).every(channel => channel.isLive === false), "followers work independently of live audience");
});

test("explicit username intent and recent familiarity can prefer the small channel", () => {
  const index = new ChannelSearchIndex(); index.put(popularity.response.data.users.map(user => observedChannel(user, now)));
  assert.equal(index.search("@illo", [], 8, now)[0].login, "illo");
  assert.equal(index.search("@illoju", [], 8, now)[0].login, "illoju");
  assert.equal(index.search("illo", [{ channel: "illo", timestamp: now }], 8, now)[0].login, "illo");
  assert.equal(index.search("illo", [{ channel: "illo", timestamp: now - 30 * 86_400_000 }], 8, now)[0].login, "illojuan", "old visits should not permanently override general intent");
});

test("popularity is generic, bounded, and cannot dominate a specific long username or unrelated match", () => {
  const index = new ChannelSearchIndex(); index.put([
    channel("tiny"), channel("tinycaster", { followerCount: 5_000_000, isPartner: true, popularityObservedAt: now }),
    channel("unrelatedstar", { followerCount: 100_000_000, popularityObservedAt: now }),
  ]);
  assert.equal(index.search("tiny", [], 8, now)[0].login, "tinycaster");
  index.put([channel("tinycaster_local"), channel("tinycaster_localtv", { followerCount: 100_000_000, isPartner: true, popularityObservedAt: now })]);
  assert.equal(index.search("tinycaster_local", [], 8, now)[0].login, "tinycaster_local");
  assert.ok(!index.search("tiny", [], 8, now).some(channel => channel.login === "unrelatedstar"));
});

test("durable popularity survives ordinary live refreshes and expires independently", () => {
  const index = new ChannelSearchIndex();
  index.put([channel("tiny"), channel("tinycaster", { followerCount: 5_000_000, isPartner: true, popularityObservedAt: now, observedAt: now, isLive: false })]);
  index.put([channel("tinycaster", { observedAt: now + 10, isLive: true })]);
  assert.equal(index.search("tiny", [], 8, now + 120_001)[0].login, "tinycaster");
  assert.equal(index.search("tiny", [], 8, now + 8 * 86_400_000)[0].login, "tiny");
  index.put([channel("tinycaster", { followerCount: 0, isPartner: false, popularityObservedAt: now + 20 })]);
  assert.equal(index.search("tiny", [], 8, now + 30)[0].login, "tiny", "new zero is an observation, not a missing field");
});

test("category and title clues work below name matches and only with fresh observations", () => {
  const index = new ChannelSearchIndex();
  index.put([channel("chessplayer"), channel("gamer", { isLive: true, gameName: "Chess", title: "Learning openings", observedAt: now })]);
  assert.deepEqual(index.search("chess", [], 8, now).map(x => x.login), ["chessplayer", "gamer"]);
  assert.equal(index.search("openings", [], 8, now)[0].login, "gamer");
  assert.equal(index.search("openings", [], 8, now + 120_001).length, 0);
  assert.equal(index.search("gamer", [], 8, now + 120_001)[0].isLive, undefined);
});

test("empty/short/unrelated queries do not return generic popular channels", () => {
  const index = new ChannelSearchIndex(); index.put(SEARCH_SEEDS);
  for (const query of ["", "a", "!!!", "zzzzzzqqq", "x".repeat(81)]) assert.deepEqual(index.search(query), []);
});

test("fresh observations win over hints and older data; deduplication/capacity remain bounded", () => {
  const index = new ChannelSearchIndex(2);
  index.put([channel("alpha", { displayName: "Alpha", isLive: true, observedAt: now })]);
  index.put([channel("ALPHA", { observedAt: now - 1000, isLive: false }), channel("alpha")]);
  assert.equal(index.search("alpha", [], 8, now)[0].isLive, true);
  index.put([channel("bravo"), channel("charlie")]);
  assert.equal(index.snapshot().length, 2); assert.deepEqual(index.search("alpha"), []);
});

test("confirmed missing names are not resurrected by a late name-only shelf", () => {
  const index = new ChannelSearchIndex(); index.put([channel("absentfixture")]);
  index.remove(["absentfixture"]); index.put([channel("absentfixture")]);
  assert.equal(index.search("absentfixture").length, 0);
  index.put([channel("absentfixture", { isLive: true, observedAt: Date.now() - 10_000 })]);
  assert.equal(index.search("absentfixture").length, 0);
  index.put([channel("absentfixture", { isLive: false, observedAt: Date.now() + 1 })]);
  assert.equal(index.search("absentfixture").length, 1);
  index.remove(["absentfixture"], Date.now() - 1000);
  assert.equal(index.search("absentfixture").length, 1, "older negative response cannot remove a newer observation");
});

test("storage/API inputs are bounded, malformed rows rejected and absent live state preserved", () => {
  const rows = readSearchChannels([null, { login: 42 }, channel("../bad"), channel("safe", { isLive: "yes", viewersCount: -1, observedAt: Infinity, profileImageURL: "javascript:x" })]);
  assert.equal(rows.length, 1); assert.equal(rows[0].isLive, undefined); assert.equal(rows[0].profileImageURL, undefined);
  assert.equal(readSearchChannels(Array.from({ length: 2500 }, () => channel("safe"))).length, 2000);
});

test("one bounded identity request hydrates prefix candidates and unfamiliar exact names", async () => {
  const fetch = mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    if (/searchFor/.test(body.query)) return Response.json({ data: { searchFor: { channels: { edges: [] } } } });
    assert.match(body.query, /users\(logins:\$logins\)/); assert.doesNotMatch(body.query, /after:|\bsearch\s*\(/);
    assert.equal(body.variables.logins[0], "rub"); assert.ok(body.variables.logins.includes("rubius")); assert.ok(body.variables.logins.length <= 8);
    return Response.json({ data: { users: [null, { login: "rubius", displayName: "Rubius", stream: { title: "Live", viewersCount: 20_000, game: { name: "Minecraft" } } }] } });
  });
  const response = await searchChannels("rub");
  assert.equal(response.results[0].login, "rubius"); assert.equal(response.results[0].isLive, true);
  assert.ok(response.missing.includes("rub")); assert.equal(fetch.mock.callCount(), 2);
  channelIndex.put([channel("unfamiliarfixture", { observedAt: now })]);
});

test("identity hydration uses the captured follower/partner contract for ambiguous and explicit queries", async () => {
  const fetch = mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.query, /followers\s*\{\s*totalCount\s*\}/);
    assert.match(body.query, /roles\s*\{\s*isPartner\s*\}/);
    if (/searchFor/.test(body.query)) return Response.json(candidateFixture("illo").response);
    return Response.json({ data: { users: popularity.response.data.users.filter(user => body.variables.logins.includes(user.login)) } });
  });
  const broad = await searchChannels("illo");
  assert.equal(broad.results[0].login, "illojuan");
  assert.equal(broad.results[0].followerCount, popularity.response.data.users.find(user => user.login === "illojuan").followers.totalCount);
  assert.equal(broad.results[0].isPartner, true);
  assert.equal((await searchChannels("@illo")).results[0].login, "illo");
  assert.equal(fetch.mock.callCount(), 3, "broad discovery plus hydration, followed by one explicit identity lookup");
  assert.equal((await searchChannels("@illo")).results[0].login, "illo");
  assert.equal(fetch.mock.callCount(), 3, "identical explicit hydration is cached");
});

test("optional popularity schema degradation falls back to identity once", async () => {
  const fetch = mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    return /followers/.test(body.query) ? Response.json({ errors: [{ message: 'Cannot query field "followers"' }] })
      : Response.json({ data: { users: [{ login: "schemafixture", displayName: "Schema Fixture", stream: null }] } });
  });
  assert.equal((await searchChannels("@schemafixture")).results[0].login, "schemafixture");
  assert.equal(fetch.mock.callCount(), 2);
});

test("cached negative hydration retains its sampling time and cannot delete a newer positive", async () => {
  let clock = now + 100_000;
  mock.method(Date, "now", () => clock);
  const fetch = mock.method(globalThis, "fetch", async () => Response.json({ data: { users: [null] } }));
  const original = await searchChannels("@receiptnegative");
  clock += 10_000;
  channelIndex.put([channel("receiptnegative", { isLive: true, observedAt: clock })]);
  clock += 10_000;
  const cached = await searchChannels("@receiptnegative");
  assert.equal(cached.checkedAt, original.checkedAt);
  assert.equal(cached.results[0].login, "receiptnegative");
  assert.equal(cached.results[0].isLive, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test("cached positive hydration cannot overwrite newer live or popularity observations", async () => {
  let clock = now + 100_000;
  mock.method(Date, "now", () => clock);
  const fetch = mock.method(globalThis, "fetch", async () => Response.json({ data: { users: [{
    login: "receiptpositive", displayName: "Receipt Positive", stream: null,
    followers: { totalCount: 5_000_000 }, roles: { isPartner: true },
  }] } }));
  const original = await searchChannels("@receiptpositive");
  clock += 10_000;
  channelIndex.put([channel("receiptpositive", { isLive: true, observedAt: clock,
    followerCount: 0, isPartner: false, popularityObservedAt: clock })]);
  clock += 10_000;
  const cached = await searchChannels("@receiptpositive");
  assert.equal(cached.checkedAt, original.checkedAt);
  assert.equal(cached.results[0].isLive, true);
  assert.equal(cached.results[0].followerCount, 0);
  assert.equal(cached.results[0].isPartner, false);
  assert.equal(cached.results[0].observedAt, clock - 10_000);
  assert.equal(cached.results[0].popularityObservedAt, clock - 10_000);
  assert.equal(fetch.mock.callCount(), 1);
});

test("query-driven receipts include ordinary channels and rank a broad first-page pool", () => {
  for (const term of ["rubius", "ricky", "apple", "illo"]) {
    const channels = parseCandidates(candidateFixture(term).response.data, now);
    assert.equal(channels.length, 40);
    assert.ok(channels.some(channel => channel.isPartner === false && channel.followerCount < 1000));
    const index = new ChannelSearchIndex(); index.put(channels);
    const results = index.search(term, [], 8, now, channels.map(channel => channel.login));
    assert.equal(results.length, 8, term);
    if (term === "rubius") assert.equal(results[0].login, "rubius");
    if (term === "illo") assert.equal(results[0].login, "illojuan");
  }
});

test("upstream semantic matches belong only to their query and rank below literal matches", () => {
  const index = new ChannelSearchIndex();
  index.put([channel("unrelatedfixture"), channel("apple_local")]);
  assert.deepEqual(index.search("apple", [], 8, now, ["unrelatedfixture"]).map(channel => channel.login), ["apple_local", "unrelatedfixture"]);
  assert.deepEqual(index.search("otherword", [], 8, now), []);
  assert.equal(index.search("@apple_local", [], 8, now, ["unrelatedfixture"])[0].login, "apple_local");
});

test("server returns a full discovered pool so browser familiarity can rank beyond eight", async () => {
  const fixture = candidateFixture("ricky");
  const users = fixture.response.data.searchFor.channels.edges.map(edge => edge.item);
  let candidateCalls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    if (/searchFor/.test(body.query)) {
      candidateCalls++;
      assert.match(body.query, /limit:\s*40/); assert.doesNotMatch(body.query, /cursor:|after:|\bsearch\(/);
      return Response.json(fixture.response);
    }
    assert.ok(body.variables.logins.length <= 8);
    return Response.json({ data: { users: users.filter(user => body.variables.logins.includes(user.login)) } });
  });
  const response = await searchChannels("ricky");
  assert.equal(response.matchedLogins.length, 40);
  assert.ok(response.results.length > 8);
  assert.ok(response.results.some(channel => channel.login === "rickyfromwish"));
  const index = new ChannelSearchIndex(); index.put(response.results);
  const visit = { channel: "rickyfromwish", timestamp: Date.now() };
  assert.ok(index.search("ricky", [visit], 8, Date.now(), response.matchedLogins).some(channel => channel.login === visit.channel));
  await searchChannels("ricky");
  assert.equal(candidateCalls, 1);
});

test("candidate cache preserves sampling timestamps; null shelves are not empty results", async () => {
  let clock = now + 200_000;
  mock.method(Date, "now", () => clock);
  const fetch = mock.method(globalThis, "fetch", async () => Response.json(candidateFixture("apple").response));
  const original = await searchCandidates("cachedsemanticfixture");
  clock += 20_000;
  const cached = await searchCandidates("cachedsemanticfixture");
  assert.equal(cached.checkedAt, original.checkedAt);
  assert.equal(cached.channels[0].observedAt, original.checkedAt);
  assert.equal(fetch.mock.callCount(), 1);
  for (const data of [null, {}, { searchFor: null }, { searchFor: { channels: null } }]) assert.throws(() => parseCandidates(data, now), { kind: "schema" });
  assert.deepEqual(parseCandidates({ searchFor: { channels: { edges: [] } } }, now), []);
});

test("candidate discovery survives unavailable identity hydration", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => /searchFor/.test(JSON.parse(init.body).query)
    ? Response.json(candidateFixture("apple").response) : new Response("Unavailable", { status: 503 }));
  const response = await searchChannels("apple");
  assert.equal(response.matchedLogins.length, 40);
  assert.equal(response.results.length, 40);
  assert.deepEqual(response.missing, []);
});

test("unavailable discovery cannot masquerade as an empty successful word search", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => /searchFor/.test(JSON.parse(init.body).query)
    ? Response.json({ data: { searchFor: null } }) : Response.json({ data: { users: [] } }));
  await assert.rejects(searchChannels("absentsemanticfixture"), { kind: "schema" });
});

test("empty discovery cannot hide a failed ordinary exact-username lookup", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => /searchFor/.test(JSON.parse(init.body).query)
    ? Response.json({ data: { searchFor: { channels: { edges: [] } } } }) : new Response("Unavailable", { status: 503 }));
  await assert.rejects(searchChannels("failedidentityfixture"), { kind: "transport" });
});

test("native autocomplete supplies offline state and avatar together without identity hydration", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/search/autocomplete-rubius.json", import.meta.url)));
  const fetch = mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.operationName, fixture.operationName);
    assert.equal(body.extensions.persistedQuery.sha256Hash, fixture.sha256Hash);
    assert.equal(body.variables.withOfflineChannelContent, true);
    return Response.json(fixture.response_redacted);
  });
  const receipt = await autocompleteChannels("nativefixture");
  const rubius = receipt.results.find(channel => channel.login === "rubius");
  assert.equal(rubius.isLive, false); assert.ok(rubius.profileImageURL); assert.equal(rubius.isVerified, true);
  assert.equal(rubius.observedAt, receipt.checkedAt);
  await autocompleteChannels("nativefixture");
  assert.equal(fetch.mock.callCount(), 1);
  assert.throws(() => parseAutocomplete({ searchSuggestions: null }, now), { kind: "schema" });
});

test("autocomplete verification expires independently without erasing durable popularity", () => {
  const index = new ChannelSearchIndex();
  index.put([channel("verifiedfixture", { followerCount: 1_000_000, isPartner: true, popularityObservedAt: now })]);
  index.put([channel("verifiedfixture", { isLive: false, observedAt: now, isVerified: true, verifiedObservedAt: now })]);
  index.put([channel("verifiedfixture", { isLive: true, observedAt: now + 100_000 })]);
  const result = index.search("verifiedfixture", [], 8, now + 120_001)[0];
  assert.equal(result.isLive, true); assert.equal(result.isVerified, undefined);
  assert.equal(result.followerCount, 1_000_000); assert.equal(result.isPartner, true);
});

test("autocomplete's total deadline includes queued transport time and never sends after expiry", async () => {
  const releases = [];
  const fetch = mock.method(globalThis, "fetch", () => new Promise(resolve => { releases.push(() => resolve(Response.json({ data: { video: { id: "1" } } }))); }));
  const blockers = Array.from({ length: 6 }, () => execute({ name: "VideoMetadata", family: "video", document: { query: 'query VideoMetadata { video(id:"1") { id } }' }, validate: data => data, discovery: true }));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(fetch.mock.callCount(), 6);
  const keepAlive = setTimeout(() => {}, 1500);
  try {
    await assert.rejects(autocompleteChannels("queueddeadlinefixture"), { name: "TimeoutError" });
    assert.equal(fetch.mock.callCount(), 6);
  } finally {
    clearTimeout(keepAlive); releases.forEach(release => release()); await Promise.all(blockers);
  }
  assert.equal(fetch.mock.callCount(), 6, "expired autocomplete never becomes an upstream request");
});

test("candidate integrity is terminal without cursor, retry, or challenge fallback", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => Response.json({ errors: [{ message: "failed integrity check", extensions: { code: "IntegrityCheckFailed" } }] }));
  await assert.rejects(searchCandidates("blockedsemanticfixture"), { kind: "integrity" });
  await assert.rejects(searchCandidates("blockedsemanticfixture2"), { kind: "integrity" });
  assert.equal(fetch.mock.callCount(), 1);
});

test("search integrity errors are terminal with no retry or alternate shape", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => Response.json({ errors: [{ message: "failed integrity check", extensions: { code: "IntegrityCheckFailed" } }] }));
  await assert.rejects(searchChannels("@uniquefixturex"), { kind: "integrity" });
  await assert.rejects(searchChannels("@uniquefixturey"), { kind: "integrity" });
  assert.equal(fetch.mock.callCount(), 1);
});
