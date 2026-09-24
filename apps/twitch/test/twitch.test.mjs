import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import { fetchChannel, fetchVodMetadata } from "../lib/twitch.ts";

afterEach(() => mock.restoreAll());

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

  const channel = await fetchChannel("example");
  assert.equal(channel.login, "example");
  assert.deepEqual(channel.videos, []);
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

  await assert.rejects(fetchChannel("example"), /invalid query/);
  assert.equal(calls, 1);
});

test("chat pagination advances by timestamp and retains deleted commenters", async () => {
  const { fetchVodComments } = await import("../lib/twitch.ts");
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
  assert.equal(page.messages[0].color, null);
});

test("unavailable replay is distinct from a valid empty chat", async () => {
  const { fetchVodComments } = await import("../lib/twitch.ts");
  mock.method(globalThis, "fetch", async () => Response.json({ data: { video: { comments: null } } }));
  await assert.rejects(fetchVodComments("123", 0), /unavailable/);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ data: { video: { comments: { edges: [], pageInfo: { hasNextPage: false } } } } }));
  assert.deepEqual(await fetchVodComments("123", 0), { messages: [], nextOffset: null });
});
