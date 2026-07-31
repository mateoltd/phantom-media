import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWrapperMediaUrl,
  decodeWrapperMediaTarget,
  encodeWrapperMediaTarget,
  primeWrapperMediaTarget,
  proxyWrapperCandidate,
  proxyWrapperMediaRequest,
  rewriteWrapperHls,
} from "../src/providers/wrapper-media-proxy.mjs";

const ROOT =
  "https://proxy.cinemaos.live/cors-m3u8-proxy?url=https%3A%2F%2Fmedia.example%2Fmaster.m3u8";

function response(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/vnd.apple.mpegurl", ...init.headers },
    ...init,
  });
}

test("the relay accepts only the fixed public wrapper hosts and media paths", () => {
  assert.equal(assertWrapperMediaUrl(ROOT).hostname, "proxy.cinemaos.live");
  assert.throws(
    () =>
      assertWrapperMediaUrl(
        "https://proxy.cinemaos.live/admin?url=https://private.example",
      ),
    /not allowed/,
  );
  assert.throws(
    () =>
      assertWrapperMediaUrl(
        "https://private.example/cors-m3u8-proxy?url=https://media.example",
      ),
    /not allowed/,
  );
});

test("the relay constrains Videasy Breach to its signed public worker contract", () => {
  const breach =
    "https://peraspera.waltersamson74809.workers.dev/?" +
    "payload=abcdefgh.ijklmnop&headers=qrstuvwx.yzABCDEF&type=m3u8";
  assert.equal(
    assertWrapperMediaUrl(breach).hostname,
    "peraspera.waltersamson74809.workers.dev",
  );
  assert.throws(
    () =>
      assertWrapperMediaUrl(
        "https://peraspera.waltersamson74809.workers.dev/?url=https://private.example",
      ),
    /not allowed/,
  );
});

test("wrapper candidates become full-relay candidates without leaking a remote URL", () => {
  const candidate = proxyWrapperCandidate(
    {
      id: "src:s7:0",
      server: "s7",
      serverLabel: "Source 10",
      url: ROOT,
      type: "hls",
      declaredType: "hls",
      resolution: null,
      format: null,
      size: null,
      score: 300,
    },
    "https://phantom.example",
  );
  const url = new URL(candidate.url);
  assert.equal(url.origin, "https://phantom.example");
  assert.equal(candidate.deliveryMode, "resolver-full-relay");
  assert.equal(
    decodeWrapperMediaTarget(url.searchParams.get("target")).href,
    ROOT,
  );
});

test("HLS children remain inside the constrained relay", () => {
  const rewritten = rewriteWrapperHls(
    `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000
https://proxy.cinemaos.live/cors-m3u8-proxy?url=child
`,
    ROOT,
    "https://phantom.example",
  );
  const target = rewritten.match(/target=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(target);
  assert.equal(
    decodeWrapperMediaTarget(target).hostname,
    "proxy.cinemaos.live",
  );
});

test("direct children from the fixed HLS wrapper are sent back through it", () => {
  const root =
    "https://play.cinemaos.in/api/hlsproxy?" +
    "url=https%3A%2F%2Fmedia.example%2Findex.m3u8&" +
    "ref=https%3A%2F%2Fembed.example%2F&" +
    "org=https%3A%2F%2Fembed.example";
  const rewritten = rewriteWrapperHls(
    "#EXTM3U\nhttps://media.example/segment.ts?token=public\n",
    root,
    "https://phantom.example",
  );
  const encoded = rewritten.match(/target=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(encoded);
  const target = decodeWrapperMediaTarget(encoded);
  assert.equal(target.hostname, "play.cinemaos.in");
  assert.equal(target.pathname, "/api/hlsproxy");
  assert.equal(
    target.searchParams.get("url"),
    "https://media.example/segment.ts?token=public",
  );
  assert.equal(target.searchParams.get("ref"), "https://embed.example/");
});

test("the worker wrapper also retains its public referer contract", () => {
  const root =
    "https://play.cinemaos.workers.dev/proxy?" +
    "url=https%3A%2F%2Fmedia.example%2Findex.m3u8&" +
    "referer=https%3A%2F%2Fembed.example%2F";
  const rewritten = rewriteWrapperHls(
    "#EXTM3U\nhttps://media.example/segment.ts\n",
    root,
    "https://phantom.example",
  );
  const encoded = rewritten.match(/target=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(encoded);
  const target = decodeWrapperMediaTarget(encoded);
  assert.equal(target.hostname, "play.cinemaos.workers.dev");
  assert.equal(target.pathname, "/proxy");
  assert.equal(target.searchParams.get("url"), "https://media.example/segment.ts");
  assert.equal(target.searchParams.get("referer"), "https://embed.example/");
});

test("the relay supplies wrapper headers, rewrites manifests, and forwards ranges", async () => {
  const proxy = encodeWrapperMediaTarget(ROOT, "https://phantom.example");
  const calls = [];
  const fetchImpl = async (input, options) => {
    calls.push({ input: new URL(input), options });
    if (new URL(input).pathname === "/cors-m3u8-proxy") {
      return response(
        "#EXTM3U\nhttps://proxy.cinemaos.live/cors-ts-proxy?url=segment\n",
      );
    }
    return response("segment", {
      status: 206,
      headers: { "content-type": "video/mp2t" },
    });
  };

  const manifest = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl,
  });
  const text = await manifest.text();
  assert.equal(manifest.status, 200);
  assert.match(text, /https:\/\/phantom\.example\/api\/sources\/relay-media/);
  assert.equal(calls[0].options.headers.get("origin"), "https://cinemaos.tech");
  assert.equal(calls[0].options.headers.get("referer"), "https://cinemaos.tech/");

  const child = text.match(/https:\/\/[^\s]+/)?.[0];
  assert.ok(child);
  await proxyWrapperMediaRequest(
    new Request(child, { headers: { range: "bytes=0-1" } }),
    { fetchImpl },
  );
  assert.equal(calls[1].options.headers.get("range"), "bytes=0-1");
});

test("the relay supplies Videasy's public player headers to Breach", async () => {
  const root =
    "https://peraspera.waltersamson74809.workers.dev/?" +
    "payload=abcdefgh.ijklmnop&headers=qrstuvwx.yzABCDEF&type=m3u8";
  const child =
    "https://peraspera.waltersamson74809.workers.dev/?" +
    "payload=ABCDEFGH.IJKLMNOP&headers=qrstuvwx.yzABCDEF";
  const proxy = encodeWrapperMediaTarget(root, "https://phantom.example");
  const calls = [];
  const manifest = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl: async (input, options) => {
      calls.push({ input: new URL(input), options });
      return response(`#EXTM3U\n${child}\n`);
    },
  });
  const text = await manifest.text();
  assert.match(text, /https:\/\/phantom\.example\/api\/sources\/relay-media/);
  assert.equal(
    calls[0].options.headers.get("origin"),
    "https://player.videasy.to",
  );
  assert.equal(
    calls[0].options.headers.get("referer"),
    "https://player.videasy.to/",
  );
});

test("a primed Videasy manifest is reused for probe and attachment", async () => {
  const root =
    "https://peraspera.waltersamson74809.workers.dev/?" +
    "payload=prime1234.fixture&headers=header1234.fixture&type=m3u8";
  let calls = 0;
  await primeWrapperMediaTarget(root, {
    fetchImpl: async () => {
      calls += 1;
      return response("#EXTM3U\n#EXT-X-ENDLIST\n");
    },
  });
  const proxy = encodeWrapperMediaTarget(root, "https://phantom.example");
  const result = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("the primed manifest should be reused");
    },
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.match(await result.text(), /#EXTM3U/);
});
