import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import {
  buildChannelDescription,
  isValidChannelName,
  loadChannelPage,
  normalizeChannelName,
} from "../lib/channel-page.ts";

afterEach(() => mock.restoreAll());

const CHANNEL = {
  id: "1",
  login: "example",
  displayName: "Example",
  description: "A channel.",
  profileImageURL: "https://static-cdn.jtvnw.net/example.png",
  stream: null,
  videos: null,
};

/** The GraphQL shape `fetchChannel` reads, so we drive the real fetch path. */
function mockChannelResponse(user = CHANNEL) {
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ data: { user } })
  );
}

function mockChannelError(message) {
  return mock.method(globalThis, "fetch", async () => {
    throw new TypeError(message);
  });
}

/**
 * A thrown upstream error can also arrive as a GraphQL error payload, which is
 * how the "channel does not exist" case actually surfaces.
 */
function mockChannelMissing() {
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ errors: [{ message: "Channel not found" }] })
  );
}

test("normalises channel names the way the URL expects", () => {
  assert.equal(normalizeChannelName("@Example"), "example");
  assert.equal(normalizeChannelName("  EXAMPLE  "), "example");
});

test("rejects app-owned and malformed channel names", () => {
  assert.equal(isValidChannelName("example"), true);
  // These resolve to app routes, not channels.
  assert.equal(isValidChannelName("videos"), false);
  assert.equal(isValidChannelName("categories"), false);
  assert.equal(isValidChannelName("disclaimer"), false);
  assert.equal(isValidChannelName("api"), false);
  assert.equal(isValidChannelName("robots.txt"), false);
  // Malformed per the Twitch login rules.
  assert.equal(isValidChannelName("ab"), false);
  assert.equal(isValidChannelName("has spaces"), false);
  assert.equal(isValidChannelName("way_too_long_to_be_a_real_login"), false);
});

test("a real miss is reported as missing, not as an error", async () => {
  mockChannelMissing();

  assert.deepEqual(await loadChannelPage("missingly"), { status: "missing" });
});

test("a Twitch outage is an error, so real pages are not pruned", async () => {
  // An outage message must not be mistaken for "this channel is gone",
  // otherwise a blip would 404 every channel page in the index.
  mock.method(globalThis, "fetch", async () =>
    Response.json({ errors: [{ message: "Twitch API is temporarily unavailable" }] })
  );
  assert.deepEqual(await loadChannelPage("outage1"), { status: "error" });

  mock.restoreAll();
  mockChannelError("fetch failed");
  assert.deepEqual(await loadChannelPage("outage2"), { status: "error" });
});

test("invalid names short-circuit before any upstream call", async () => {
  let called = 0;
  mock.method(globalThis, "fetch", async () => {
    called += 1;
    return Response.json({ data: { user: CHANNEL } });
  });

  assert.deepEqual(await loadChannelPage("videos"), { status: "missing" });
  assert.deepEqual(await loadChannelPage("ab"), { status: "missing" });
  assert.equal(called, 0, "must not hit Twitch for a non-channel path");
});

test("a live channel resolves without loading a catalog", async () => {
  mockChannelResponse({
    ...CHANNEL,
    stream: { id: "s", title: "Live!", type: "live", viewersCount: 10, createdAt: "" },
  });

  const result = await loadChannelPage("liveone");
  assert.equal(result.status, "ok");
  assert.ok(result.channel.stream);
  // A copy this fresh needs no recheck in the browser.
  assert.ok(result.age >= 0 && result.age < 30_000);
});

/**
 * This string is emitted verbatim as <meta name="description"> and
 * og:description, where search results truncate it. The failure mode is silent
 * (a description cut mid-word in the SERP), so the budget is worth pinning.
 */
test("a realistic channel keeps its full description, unclamped", () => {
  // Twitch caps display names at 25 characters.
  const channel = { ...CHANNEL, displayName: "N".repeat(25) };
  const description = buildChannelDescription(channel);

  assert.ok(
    description.length <= 160,
    `a worst-case real name produced ${description.length} chars: ${description}`
  );
  assert.ok(!description.endsWith("…"), "a real name should not need clamping");
});

test("an over-long display name is clamped rather than overflowing", () => {
  const description = buildChannelDescription({ ...CHANNEL, displayName: "N".repeat(400) });

  assert.ok(description.length <= 160, `got ${description.length} chars`);
  assert.ok(description.endsWith("…"), "clamped output should be marked as truncated");
});

test("live and offline descriptions differ", () => {
  const live = { ...CHANNEL, stream: { id: "s", title: "L", type: "live", viewersCount: 1, createdAt: "" } };
  assert.notEqual(buildChannelDescription(live), buildChannelDescription(CHANNEL));
});
