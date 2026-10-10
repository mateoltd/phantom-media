import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { POST } from "../app/api/channel/discovery/route.ts";
import { discoveryRequestBody, discoveryRequestKey, discoveryResponse } from "../lib/discovery/request.ts";

afterEach(() => mock.restoreAll());

const entry = { channel: "Example", vodId: "123", timestamp: 100, title: "GTA #1 & 💣 AQUÍ ñ é ? + % / =" };
const request = (body) => new Request("https://example.com/api/channel/discovery", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
});

function mockDiscovery() {
  const calls = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    const payload = JSON.parse(init.body);
    calls.push(payload);
    const { query, variables } = payload;
    const data = query.includes("query RecentChannels") ? { users: variables.logins.map((login) => ({ id: login, login, displayName: login, stream: null })) }
      : query.includes("query DiscoveryDirectory") ? { streams: { edges: [{ node: { broadcaster: {
        id: "live", login: "livechannel", displayName: "Live Channel", stream: { title: "Live", viewersCount: 100 },
      } } }] } } : {};
    return Response.json({ data });
  });
  return calls;
}

test("JSON request bodies preserve delimiters and Unicode without putting history in the URL", async () => {
  const outgoing = request(discoveryRequestBody([entry]));
  assert.equal((await outgoing.clone().json()).history[0].title, entry.title);
  mockDiscovery();
  const response = await POST(outgoing);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.recent[0].login, "example");
  assert.equal(data.sections[0].channels[0].login, "livechannel");
});

test("metadata hydration retains request identity; a new visit, removal, or VOD changes it", () => {
  const original = [{ ...entry, title: undefined }];
  const hydrated = [{ ...entry, lengthSeconds: 3600, previewThumbnailURL: "https://example.com/image.jpg" }];
  assert.equal(discoveryRequestKey(original), discoveryRequestKey(hydrated));
  assert.notEqual(discoveryRequestBody(original), discoveryRequestBody(hydrated), "a later explicit refresh still sends the latest metadata");
  assert.notEqual(discoveryRequestKey(original), discoveryRequestKey([{ ...entry, timestamp: 101 }]));
  assert.notEqual(discoveryRequestKey(original), discoveryRequestKey([{ ...entry, vodId: "124" }]));
  assert.notEqual(discoveryRequestKey(original), discoveryRequestKey([]));
});

test("POST accepts mixed or malformed advisory history and still returns live channels", async () => {
  const calls = mockDiscovery();
  for (const history of [[null, { channel: "bad!", timestamp: 1 }, { channel: "validhint", vodId: "999", timestamp: 1 }], "{truncated", {}, null]) {
    const response = await POST(request({ channels: ["advisoryseed"], history }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sections[0].channels[0].login, "livechannel");
  }
  assert.ok(calls.some(({ query }) => query.includes('video(id: "999")')), "valid hints survive adjacent invalid entries");
});

test("30 maximum-length titles exceeding the former aggregate limit are accepted and history is bounded", async () => {
  const history = Array.from({ length: 31 }, (_, index) => ({ channel: "longtitles", vodId: String(index + 1), timestamp: index, title: '"'.repeat(500) }));
  const body = discoveryRequestBody(history);
  assert.ok(body.length > 16_000);
  assert.equal(JSON.parse(body).history.length, 30);
  mockDiscovery();
  assert.equal((await POST(request(body))).status, 200);
});

test("invalid channels or request envelopes return distinct terminal validation reasons without upstream calls", async () => {
  mock.method(globalThis, "fetch", () => { assert.fail("validation failures must not call Twitch"); });
  for (const channels of [null, "example", ["bad!"], [123], ["one", "two", "three", "four", "five", "six", "seven"]]) {
    const response = await POST(request({ channels, history: [entry] }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid channels" });
  }
  for (const body of ["{", "null", "[]"]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /^Invalid discovery request/);
  }
});

test("oversized discovery bodies are rejected before parsing or upstream requests", async () => {
  mock.method(globalThis, "fetch", () => { assert.fail("oversized bodies must not call Twitch"); });
  const response = await POST(request({ channels: ["example"], history: "x".repeat(128 * 1024) }));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Discovery request too large" });
});

test("4xx validation failures are terminal and preserve known reasons without a retry cooldown", async () => {
  await assert.rejects(discoveryResponse(Response.json({ error: "Invalid channels" }, { status: 400 })),
    (error) => error.terminal === true && error.retryAt === 0 && error.message.includes("Invalid channels"));
  await assert.rejects(discoveryResponse(new Response("not JSON", { status: 400 })),
    (error) => error.terminal === true && error.message.includes("request was rejected"));
  await assert.rejects(discoveryResponse(Response.json({ error: "private upstream details" }, { status: 403 })),
    (error) => error.terminal === true && error.message.includes("Twitch is blocking") && !error.message.includes("private"));
});

test("rate limits and upstream failures retain their retry delays", async () => {
  mock.method(Date, "now", () => 1000);
  await assert.rejects(discoveryResponse(new Response(null, { status: 429, headers: { "Retry-After": "45" } })),
    (error) => error.terminal === false && error.retryAt === 46000 && error.message.includes("short break"));
  await assert.rejects(discoveryResponse(new Response(null, { status: 502 })),
    (error) => error.terminal === false && error.retryAt === 16000);
});
