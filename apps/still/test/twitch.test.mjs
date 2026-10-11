import { UpstreamError } from "../lib/errors.ts";
import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import { fetchChannelBasics } from "../lib/twitch/channels.ts";
import { fetchVodMetadata } from "../lib/twitch/videos.ts";
import { getPlaybackLocation } from "../lib/twitch/playback.ts";

afterEach(() => mock.restoreAll());

test("live requests opt into Twitch's prefetch feed while VOD requests keep archive delivery", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ data: {
    streamPlaybackAccessToken: { value: "{}", signature: "live-fixture" },
    videoPlaybackAccessToken: { value: "{}", signature: "vod-fixture" },
  } }));
  const live = new URL((await getPlaybackLocation("live", "fixturechannel")).url);
  const vod = new URL((await getPlaybackLocation("vod", "123")).url);
  assert.equal(live.searchParams.get("fast_bread"), "true");
  assert.equal(live.searchParams.get("sig"), "live-fixture");
  assert.equal(vod.searchParams.has("fast_bread"), false);
  assert.equal(vod.searchParams.get("sig"), "vod-fixture");
});

test("loads all muted intervals in the existing VOD metadata request", async () => {
  const segments = [{ offset: 16605, duration: 203 }, { offset: 200, duration: 60 }];
  const fetch = mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://gql.twitch.tv/gql");
    const { query, variables } = JSON.parse(init.body);
    assert.deepEqual(variables, { id: "123" });
    assert.match(query, /muteInfo\s*\{\s*mutedSegmentConnection\s*\{\s*nodes\s*\{\s*offset\s+duration/);
    assert.match(query, /seekPreviewsURL/);
    return Response.json({ data: { video: {
      id: "123", owner: { login: "example" }, broadcastType: "ARCHIVE", createdAt: "2026-01-01",
      muteInfo: { mutedSegmentConnection: { nodes: segments } },
    } } });
  });
  const video = await fetchVodMetadata("123");
  assert.deepEqual(video.muteInfo.mutedSegmentConnection.nodes, segments);
  assert.equal(fetch.mock.callCount(), 1, "no separate mute lookup or segment probes");
});

test("unavailable mute information does not retry or block valid VOD metadata", async () => {
  for (const path of [["video", "muteInfo"], ["video", "muteInfo", "mutedSegmentConnection"]]) {
    const fetch = mock.method(globalThis, "fetch", async () => Response.json({
      errors: [{ message: "service error", path }],
      data: { video: { id: "123", owner: { login: "example" }, broadcastType: "ARCHIVE", createdAt: "2026-01-01", muteInfo: null } },
    }));
    assert.equal((await fetchVodMetadata("123")).id, "123");
    assert.equal(fetch.mock.callCount(), 1);
    mock.restoreAll();
  }
});

test("optional mute errors do not hide errors in required VOD metadata", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => Response.json({
    errors: [
      { message: "service error", path: ["video", "muteInfo"] },
      { message: "invalid video", path: ["video"] },
    ],
    data: { video: null },
  }));
  await assert.rejects(fetchVodMetadata("123"), error => error instanceof UpstreamError && error.kind === "schema");
  assert.equal(fetch.mock.callCount(), 1);
});

test("retries transient GraphQL service errors during a channel fetch", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ errors: [{ message: "service error" }] });
    }
    return Response.json({
      data: {
        user: {
          id: "1",
          login: "example",
          displayName: "Example",
          profileImageURL: "",
          description: "",
          stream: null,
          videos: null,
        },
      },
    });
  });

  const channel = await fetchChannelBasics("example");
  assert.equal(channel.login, "example");
  assert.equal(channel.stream, null);
  assert.equal(calls, 2);
});

test("retries a transient HTTP failure during VOD metadata fetch", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 503 })
      : Response.json({
          data: { video: {
            id: "123",
            title: "Example VOD",
            owner: { login: "example" },
            broadcastType: "archive",
            createdAt: "2026-01-01T00:00:00Z",
            seekPreviewsURL: "",
          } },
        });
  });

  assert.equal((await fetchVodMetadata("123")).id, "123");
  assert.equal(calls, 2);
});

test("does not retry a permanent GraphQL error", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ errors: [{ message: "invalid query" }] });
  });

  await assert.rejects(fetchChannelBasics("example"), error => error instanceof UpstreamError && error.kind === "schema");
  assert.equal(calls, 1);
});

test("chat pagination advances by timestamp and retains deleted commenters", async () => {
  const { fetchVodComments } = await import("../lib/twitch/comments.ts");
  let variables;
  mock.method(globalThis, "fetch", async (_url, init) => {
    variables = JSON.parse(init.body).variables;
    return Response.json({ data: { video: { comments: {
      edges: [{ cursor: "next", node: { id: "message-1", contentOffsetSeconds: 30, commenter: null, message: { userColor: "not-a-color", fragments: [{ text: "hello " }, { text: "world" }] } } }],
      pageInfo: { hasNextPage: true },
    } } } });
  });
  const page = await fetchVodComments("123", 30);
  assert.deepEqual(variables, { id: "123", offset: 30 });
  assert.equal(page.nextOffset, 31);
  assert.equal(page.messages[0].user, "Deleted user");
  assert.equal(page.messages[0].text, "hello world");
  assert.match(page.messages[0].color, /^#[0-9a-f]{6}$/i);
  assert.equal(page.coverage.gapAt, 30);
});

test("unavailable replay is distinct from a valid empty chat", async () => {
  const { fetchVodComments } = await import("../lib/twitch/comments.ts");
  mock.method(globalThis, "fetch", async () => Response.json({ data: { video: { comments: null } } }));
  await assert.rejects(fetchVodComments("123", 0), /unavailable/);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ data: { video: { comments: { edges: [], pageInfo: { hasNextPage: false } } } } }));
  assert.deepEqual(await fetchVodComments("123", 0), { messages: [], nextOffset: null, coverage: { from: 0, through: 0, partial: true, gapAt: undefined } });
});
