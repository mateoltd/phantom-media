import assert from "node:assert/strict";
import test from "node:test";
import {
  CINESRC_FAILURE_DOMAIN,
  assertCineSrcMediaUrl,
  extractCineSrcContract,
  normalizeCineSrcProviders,
  parseCineSrcRscValue,
  resolveCineSrc,
} from "../src/providers/cinesrc.mjs";
import { decodeDiscoveredCineSrcMediaTarget } from "../src/providers/wrapper-media-proxy.mjs";

const ORIGIN = "https://player.example";
const PROXY_ORIGIN = "https://phantom.example";
const PROVIDER_ACTION = "a".repeat(42);
const STREAM_ACTION = "b".repeat(42);
const MASTER = "https://rotated-origin.example/media/token-1/master.m3u8";

function response(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": init.contentType ?? "text/plain",
      ...init.headers,
    },
  });
}

function contractChunk(primary = "/crypto-aug.js", stage2 = "/proof-aug.js") {
  return `let a=(0,x.createServerReference)("${PROVIDER_ACTION}",x.callServer,void 0,x.findSourceMapURL,"getProviderList"),b=(0,x.createServerReference)("${STREAM_ACTION}",x.callServer,void 0,x.findSourceMapURL,"getStream"),c="${primary}",d="${stage2}";`;
}

test("contract discovery follows rotated action hashes and runtime filenames", () => {
  const first = extractCineSrcContract([contractChunk()]);
  const second = extractCineSrcContract([
    contractChunk("/challenge-next.js", "/stage-two-next.js")
      .replaceAll(PROVIDER_ACTION, "c".repeat(48))
      .replaceAll(STREAM_ACTION, "d".repeat(48)),
  ]);

  assert.deepEqual(first, {
    providerListAction: PROVIDER_ACTION,
    streamAction: STREAM_ACTION,
    runtimePaths: ["/crypto-aug.js", "/proof-aug.js"],
  });
  assert.deepEqual(second, {
    providerListAction: "c".repeat(48),
    streamAction: "d".repeat(48),
    runtimePaths: ["/challenge-next.js", "/stage-two-next.js"],
  });
});

test("provider index normalization ranks discovered IDs without an origin allowlist", () => {
  assert.deepEqual(
    normalizeCineSrcProviders([
      { id: "new-origin", rank: 4 },
      { id: "nebula", rank: 20 },
      { id: "new-origin", rank: 99 },
      { id: "bad id", rank: 100 },
    ]),
    [
      { id: "nebula", rank: 20 },
      { id: "new-origin", rank: 4 },
    ],
  );
  assert.deepEqual(parseCineSrcRscValue(`0:{}\n1:[{"id":"edge","rank":1}]`), [
    { id: "edge", rank: 1 },
  ]);
});

test("resolver falls through the live provider index and verifies the HLS manifest", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.origin === ORIGIN && url.pathname === "/embed/movie/969681" && !init.method) {
      return response('<script src="/assets/app-rotated.js"></script>', {
        contentType: "text/html",
      });
    }
    if (url.origin === ORIGIN && url.pathname === "/assets/app-rotated.js") {
      return response(contractChunk(), { contentType: "text/javascript" });
    }
    if (url.origin === ORIGIN && ["/crypto-aug.js", "/proof-aug.js"].includes(url.pathname)) {
      return response("runtime fixture", { contentType: "text/javascript" });
    }
    if (url.origin === ORIGIN && url.pathname === "/api/c/bootstrap") {
      assert.equal(init.method, "POST");
      assert.match(init.headers["x-cs-q"], /^[A-Za-z0-9_-]+$/);
      return response(JSON.stringify({ v: 1, r: "signed-rotation", p: "public-input" }), {
        contentType: "application/json",
      });
    }
    if (url.origin === ORIGIN && init.headers?.["next-action"] === PROVIDER_ACTION) {
      return response(
        `0:{}\n1:${JSON.stringify([
          { id: "offline-top", rank: 200 },
          { id: "brand-new-index-entry", rank: 190 },
        ])}`,
      );
    }
    if (url.origin === ORIGIN && init.headers?.["next-action"] === STREAM_ACTION) {
      const args = JSON.parse(init.body);
      assert.equal(args[1], "movie");
      assert.equal(args[2], "$undefined");
      assert.match(args[4], /^primary::c2::stage2::c3::/);
      return response(`0:{}\n1:${JSON.stringify(`cipher:${args[5]}`)}`);
    }
    if (url.href === MASTER) {
      assert.equal(init.headers.origin, ORIGIN);
      return response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n1080/playlist.jpg", {
        contentType: "image/jpeg",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const runtimeFactory = () => ({
    api: {
      async gc() {
        return "primary";
      },
      async dr(cipher) {
        if (cipher === "cipher:offline-top") return { error: "offline", url: [] };
        return {
          error: null,
          url: [{ source: "HLS", url: MASTER }],
          captions: [],
        };
      },
    },
    scope: { __ss2_challenge: { async gc() { return "stage2"; } } },
  });

  const result = await resolveCineSrc(
    { type: "movie", tmdbId: 969681 },
    {
      fetchImpl,
      fresh: true,
      origin: ORIGIN,
      proxyOrigin: PROXY_ORIGIN,
      runtimeFactory,
    },
  );

  const relayed = new URL(result.variants[0].url);
  assert.equal(relayed.origin, PROXY_ORIGIN);
  assert.equal(relayed.searchParams.get("source"), "cinesrc");
  assert.equal(
    decodeDiscoveredCineSrcMediaTarget(
      relayed.searchParams.get("target"),
      relayed.searchParams.get("expires"),
      relayed.searchParams.get("signature"),
    ).href,
    MASTER,
  );
  assert.equal(result.variants[0].failureDomain, CINESRC_FAILURE_DOMAIN);
  assert.equal(result.variants[0].deliveryMode, "resolver-full-relay");
  const streamCalls = calls.filter(
    ({ init }) => init.headers?.["next-action"] === STREAM_ACTION,
  );
  assert.deepEqual(
    streamCalls.map(({ init }) => JSON.parse(init.body)[5]),
    ["offline-top", "brand-new-index-entry"],
  );
});

test("media validation accepts rotated public DNS names and rejects local targets", () => {
  assert.equal(
    assertCineSrcMediaUrl("https://unknown-next-origin.example/a/master.m3u8").hostname,
    "unknown-next-origin.example",
  );
  for (const target of [
    "http://media.example/master.m3u8",
    "https://localhost/master.m3u8",
    "https://127.0.0.1/master.m3u8",
    "https://service.local/master.m3u8",
  ]) {
    assert.throws(() => assertCineSrcMediaUrl(target));
  }
});

test("remote resolver authenticates and signs only validated CineSrc results", async () => {
  const previous = process.env.SOURCE_PROXY_SECRET;
  process.env.SOURCE_PROXY_SECRET = 'c'.repeat(40);
  try {
    const result = await resolveCineSrc({type: 'movie', tmdbId: 550}, {
      resolverUrl: 'https://resolver.example/v1/cinesrc/resolve',
      resolverSecret: 's'.repeat(40),
      proxyOrigin: PROXY_ORIGIN,
      fetchImpl: async (url, init) => {
        assert.equal(String(url), 'https://resolver.example/v1/cinesrc/resolve');
        assert.equal(init.headers.authorization, `Bearer ${'s'.repeat(40)}`);
        assert.equal(init.redirect, 'manual');
        assert.equal(JSON.parse(init.body).media.tmdbId, 550);
        return Response.json({variants: [{url: MASTER, quality: '1080p'}, {url:'http://127.0.0.1/private'}], subtitles: []});
      },
    });
    assert.equal(result.variants.length, 1);
    const signed = new URL(result.variants[0].url);
    assert.equal(signed.origin, PROXY_ORIGIN);
    assert.equal(signed.searchParams.get('source'), 'cinesrc');
    assert.equal(decodeDiscoveredCineSrcMediaTarget(
      signed.searchParams.get('target'), signed.searchParams.get('expires'),
      signed.searchParams.get('signature'),
    ).href, MASTER);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_PROXY_SECRET;
    else process.env.SOURCE_PROXY_SECRET = previous;
  }
});

test("remote resolver rejects malformed responses and preserves upstream failure stages", async () => {
  const options = {resolverUrl:'https://resolver.example/v1/cinesrc/resolve', resolverSecret:'s'.repeat(40)};
  await assert.rejects(resolveCineSrc({type:'movie',tmdbId:550}, {...options,
    fetchImpl: async () => new Response('<html>Bad gateway</html>', {status:502}),
  }), /invalid JSON/);
  await assert.rejects(resolveCineSrc({type:'movie',tmdbId:550}, {...options,
    fetchImpl: async () => Response.json({details:{stage:'provider-fallback'}}, {status:502}),
  }), error => error.status === 502 && error.details.upstream.stage === 'provider-fallback');
});
