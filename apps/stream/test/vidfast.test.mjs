import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDFAST_FAILURE_DOMAIN,
  createVidfastResolver,
  extractVidfastBootstrap,
  resolveVidfast,
} from "../src/providers/vidfast.mjs";
import {
  assertVidfastMediaUrl,
  decodeVidfastProxyTarget,
  encodeVidfastProxyTarget,
  primeVidfastMediaTarget,
  proxyVidfastRequest,
  rewriteVidfastHls,
  vidfastMediaHosts,
} from "../src/providers/vidfast-proxy.mjs";

const ORIGIN = "https://embed.example";
const CODEC = "https://codec.example";
const PROXY = "https://phantom.example";
const MEDIA_HOSTS = new Set(["media.example"]);
const BOOTSTRAP = "bootstrap_value_123456789";
const SERVERS_CIPHER = "servers_cipher_123456789";
const STREAM_CIPHER_A = "stream_cipher_a_123456789";
const STREAM_CIPHER_B = "stream_cipher_b_123456789";
const MASTER = "https://media.example/title/master.m3u8";

function response(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": init.contentType ?? "text/plain",
      ...init.headers,
    },
  });
}

function json(value, init = {}) {
  return response(JSON.stringify(value), {
    ...init,
    contentType: "application/json",
  });
}

function resolverFetch() {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.origin === ORIGIN && url.pathname === "/tv/37680/7/5") {
      return response(`<script>{"props":{\\"en\\":\\"${BOOTSTRAP}\\"}}</script>`, {
        contentType: "text/html",
      });
    }
    if (url.origin === CODEC && url.pathname === "/api/enc-vidfast") {
      assert.equal(url.searchParams.get("text"), BOOTSTRAP);
      return json({
        status: 200,
        result: {
          servers: `${ORIGIN}/opaque/servers`,
          stream: `${ORIGIN}/opaque/stream`,
          token: "",
        },
        info: "fixture",
      });
    }
    if (url.origin === ORIGIN && url.pathname === "/opaque/servers") {
      return response(SERVERS_CIPHER);
    }
    if (url.origin === ORIGIN && url.pathname.endsWith("/dead")) {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          { once: true },
        );
      });
    }
    if (url.origin === ORIGIN && url.pathname.endsWith("/edge")) {
      return response(STREAM_CIPHER_A);
    }
    if (url.origin === ORIGIN && url.pathname.endsWith("/cobra")) {
      return response(STREAM_CIPHER_B);
    }
    if (url.origin === CODEC && url.pathname === "/api/dec-vidfast") {
      const request = JSON.parse(options.body);
      if (request.text === SERVERS_CIPHER) {
        return json({
          result: [
            { name: "first", description: "original", data: "edge" },
            { name: "dead", description: "original", data: "dead" },
            { name: "second", description: "original", data: "cobra" },
          ],
        });
      }
      if (request.text === STREAM_CIPHER_A) {
        return json({
          result: {
            url: MASTER,
            tracks: [
              {
                file: "https://media.example/title/english.vtt",
                label: "English",
              },
              {
                file: "https://media.example/title/spanish.vtt",
                label: "Spanish",
              },
            ],
          },
        });
      }
      if (request.text === STREAM_CIPHER_B) {
        return json({ result: { url: MASTER, tracks: [] } });
      }
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetchImpl };
}

test("the SSR bootstrap parser accepts Vidfast's escaped Next payload", () => {
  assert.equal(
    extractVidfastBootstrap(`{\\"en\\":\\"${BOOTSTRAP}\\"}`),
    BOOTSTRAP,
  );
  assert.equal(extractVidfastBootstrap('{"other":"value"}'), null);
});

test("Vidfast resolves public endpoints into one deduplicated native candidate", async () => {
  const { calls, fetchImpl } = resolverFetch();
  const result = await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    {
      codecOrigin: CODEC,
      fetchImpl,
      mediaHosts: MEDIA_HOSTS,
      origin: ORIGIN,
      proxyOrigin: PROXY,
    },
  );

  assert.equal(result.variants.length, 1);
  assert.ok(result.latencyMs < 1_000, "a hanging server delayed a working one");
  assert.equal(result.subtitles.length, 2);
  assert.deepEqual(result.subtitles.map((track) => track.lang), ["en", "es"]);
  assert.ok(result.subtitles.every((track) =>
    track.file.startsWith("/api/sources/vidfast/proxy?"),
  ));
  assert.equal(result.variants[0].failureDomain, VIDFAST_FAILURE_DOMAIN);
  const target = decodeVidfastProxyTarget(
    new URL(result.variants[0].url).searchParams.get("target"),
    MEDIA_HOSTS,
  );
  assert.equal(target.href, MASTER);

  const bootstrapCalls = calls.filter(
    (call) => call.url.origin === CODEC && call.url.pathname === "/api/enc-vidfast",
  );
  const decodeCalls = calls.filter(
    (call) => call.url.origin === CODEC && call.url.pathname === "/api/dec-vidfast",
  );
  assert.equal(bootstrapCalls.length, 1);
  assert.equal(bootstrapCalls[0].url.searchParams.has("version"), false);
  assert.ok(
    decodeCalls.every(
      (call) => !("version" in JSON.parse(String(call.options.body))),
    ),
  );

  const upstreamPosts = calls.filter((call) => call.url.origin === ORIGIN);
  assert.equal(upstreamPosts[0].url.searchParams.get("_rsc"), "phantom");
  assert.equal(upstreamPosts[0].options.headers.rsc, "1");
  assert.ok(upstreamPosts.slice(1).every((call) => call.options.method === "POST"));
  assert.ok(upstreamPosts.slice(1).every((call) =>
    call.options.headers["x-requested-with"] === "XMLHttpRequest",
  ));

  const callCount = calls.length;
  const cached = await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    {
      codecOrigin: CODEC,
      fetchImpl,
      mediaHosts: MEDIA_HOSTS,
      origin: ORIGIN,
      proxyOrigin: PROXY,
    },
  );
  assert.equal(cached.latencyMs, 0);
  assert.equal(calls.length, callCount, "the cached result repeated extraction");
});

test("Vidfast rejects a stale decoded route and falls through codec generations", async () => {
  const fixture = resolverFetch();
  const codecOrigin = "https://codec-rotation.example";
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    fixture.calls.push({ url, options });
    if (url.origin === codecOrigin && url.pathname === "/api/enc-vidfast") {
      const legacy = url.searchParams.get("version") === "1";
      return json({
        status: 200,
        result: {
          servers: legacy
            ? `${ORIGIN}/opaque/servers`
            : `${ORIGIN}/stale/servers`,
          stream: legacy ? `${ORIGIN}/opaque/stream` : `${ORIGIN}/stale/stream`,
          token: "",
        },
      });
    }
    if (url.origin === ORIGIN && url.pathname === "/stale/servers") {
      return response("gone", { status: 404 });
    }
    if (url.origin === codecOrigin && url.pathname === "/api/dec-vidfast") {
      const request = JSON.parse(String(options.body));
      assert.equal(request.version, "1");
      const delegated = new URL(url);
      delegated.host = new URL(CODEC).host;
      return fixture.fetchImpl(delegated, options);
    }
    return fixture.fetchImpl(input, options);
  };

  const options = {
    codecOrigin,
    fetchImpl,
    fresh: true,
    mediaHosts: MEDIA_HOSTS,
    origin: ORIGIN,
    proxyOrigin: PROXY,
  };
  const result = await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    options,
  );
  assert.equal(result.variants.length, 1);
  const bootstrapVersions = fixture.calls
    .filter(
      (call) =>
        call.url.origin === codecOrigin &&
        call.url.pathname === "/api/enc-vidfast",
    )
    .map((call) => call.url.searchParams.get("version"));
  assert.deepEqual(bootstrapVersions, [null, "1"]);
  assert.equal(
    fixture.calls.filter((call) => call.url.pathname === "/stale/servers").length,
    1,
  );

  const callCount = fixture.calls.length;
  await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    { ...options, fresh: false },
  );
  assert.equal(
    fixture.calls.length,
    callCount,
    "only a fully validated strategy result should be cached",
  );
});

test("Vidfast reports every exhausted codec generation after route drift", async () => {
  const fixture = resolverFetch();
  const codecOrigin = "https://codec-exhausted.example";
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin === codecOrigin && url.pathname === "/api/enc-vidfast") {
      return json({
        status: 200,
        result: {
          servers: `${ORIGIN}/gone/servers`,
          stream: `${ORIGIN}/gone/stream`,
          token: "",
        },
      });
    }
    if (url.origin === ORIGIN && url.pathname === "/gone/servers") {
      return response("gone", { status: 404 });
    }
    return fixture.fetchImpl(input, options);
  };

  await assert.rejects(
    resolveVidfast(
      { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
      {
        codecOrigin,
        fetchImpl,
        fresh: true,
        mediaHosts: MEDIA_HOSTS,
        origin: ORIGIN,
        proxyOrigin: PROXY,
      },
    ),
    (error) => {
      assert.equal(error.name, "VidfastError");
      assert.equal(error.retryable, true);
      assert.equal(error.details.stage, "codec-strategies");
      assert.deepEqual(
        error.details.attempts.map(({ strategy, stage, status }) => ({
          strategy,
          stage,
          status,
        })),
        [
          {
            strategy: `remote-current:${codecOrigin}`,
            stage: "servers",
            status: 404,
          },
          {
            strategy: `remote-v1:${codecOrigin}`,
            stage: "servers",
            status: 404,
          },
        ],
      );
      return true;
    },
  );
});

test("a local codec strategy admits a new CDN only through its constrained path", async () => {
  const fixture = resolverFetch();
  const rotatedMaster = `https://future-rotation17.site/vd/${"a".repeat(80)}/master.m3u8`;
  const localCodec = {
    id: "local-current-test",
    async bootstrap() {
      return {
        status: 200,
        result: {
          servers: `${ORIGIN}/opaque/servers`,
          stream: `${ORIGIN}/opaque/stream`,
          token: "",
        },
      };
    },
    async decode(_fetchImpl, cipher) {
      if (cipher === SERVERS_CIPHER) {
        return { result: [{ name: "edge", data: "edge" }] };
      }
      if (cipher === STREAM_CIPHER_A) {
        return { result: { url: rotatedMaster, tracks: [] } };
      }
      throw new Error("unexpected fixture cipher");
    },
  };

  const result = await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    {
      codecStrategies: [localCodec],
      fetchImpl: fixture.fetchImpl,
      fresh: true,
      mediaHosts: new Set(),
      origin: ORIGIN,
      proxyOrigin: PROXY,
    },
  );
  const target = decodeVidfastProxyTarget(
    new URL(result.variants[0].url).searchParams.get("target"),
    new Set(),
  );
  assert.equal(target.href, rotatedMaster);
});

test("Vidfast falls back to HTML when the compact bootstrap is unavailable", async () => {
  const fixture = resolverFetch();
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (
      url.origin === ORIGIN &&
      url.pathname === "/tv/37680/7/5" &&
      url.searchParams.has("_rsc")
    ) {
      fixture.calls.push({ url, options });
      return response("compact response without player data");
    }
    return fixture.fetchImpl(input, options);
  };

  const result = await resolveVidfast(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    {
      codecOrigin: CODEC,
      fetchImpl,
      fresh: true,
      mediaHosts: MEDIA_HOSTS,
      origin: ORIGIN,
      proxyOrigin: PROXY,
    },
  );

  const pageCalls = fixture.calls.filter(
    (call) =>
      call.url.origin === ORIGIN &&
      call.url.pathname === "/tv/37680/7/5",
  );
  assert.equal(result.variants.length, 1);
  assert.equal(pageCalls.length, 2);
  assert.equal(pageCalls[0].url.searchParams.get("_rsc"), "phantom");
  assert.equal(pageCalls[1].url.search, "");
});

test("the registry resolver keeps Vidfast under opaque Source 28 identity", async () => {
  const { fetchImpl } = resolverFetch();
  const result = await createVidfastResolver("u9")(
    { type: "tv", tmdbId: 37680, season: 7, episode: 5 },
    {
      codecOrigin: CODEC,
      fetchImpl,
      mediaHosts: MEDIA_HOSTS,
      origin: ORIGIN,
      proxyOrigin: PROXY,
      fresh: true,
    },
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].server, "u9");
  assert.equal(result.candidates[0].serverLabel, "Source 28");
  assert.equal(result.candidates[0].deliveryMode, "resolver-full-relay");
});

test("proxy targets are restricted to exact approved public hosts", () => {
  assert.equal(vidfastMediaHosts().has("moon.ironwallnet.net"), true);
  assert.equal(vidfastMediaHosts().has("diskphone12.site"), true);
  assert.equal(vidfastMediaHosts().has("sandstorm13.site"), true);
  const proxy = encodeVidfastProxyTarget(MASTER, PROXY, MEDIA_HOSTS);
  assert.equal(
    decodeVidfastProxyTarget(
      new URL(proxy).searchParams.get("target"),
      MEDIA_HOSTS,
    ).href,
    MASTER,
  );
  assert.throws(
    () => assertVidfastMediaUrl("https://private.example/title/a.m3u8", MEDIA_HOSTS),
    /not allowed/,
  );
  assert.throws(
    () => assertVidfastMediaUrl("https://media.example/", MEDIA_HOSTS),
    /not allowed/,
  );
  const rotatingPath = `/vd/${"a".repeat(80)}/1080p/chunk.jpg`;
  assert.equal(
    assertVidfastMediaUrl(
      `https://future-rotation17.site${rotatingPath}`,
      MEDIA_HOSTS,
    ).hostname,
    "future-rotation17.site",
  );
  assert.throws(
    () =>
      assertVidfastMediaUrl(
        "https://future-rotation17.site/admin/chunk.jpg",
        MEDIA_HOSTS,
      ),
    /not allowed/,
  );
  assert.throws(
    () =>
      assertVidfastMediaUrl(
        `https://future-rotation17.example${rotatingPath}`,
        MEDIA_HOSTS,
      ),
    /not allowed/,
  );
});

test("HLS rewriting covers variants, audio, subtitles and AES keys", () => {
  const body = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="/title/english.vtt"
#EXT-X-KEY:METHOD=AES-128,URI="/title/key.bin"
video/index.m3u8
`;
  const rewritten = rewriteVidfastHls(body, MASTER, PROXY, MEDIA_HOSTS);
  const targets = [...rewritten.matchAll(/target=([A-Za-z0-9_-]+)/g)].map(
    (match) => decodeVidfastProxyTarget(match[1], MEDIA_HOSTS),
  );
  assert.deepEqual(
    targets.map((target) => target.pathname),
    [
      "/title/audio/index.m3u8",
      "/title/english.vtt",
      "/title/key.bin",
      "/title/video/index.m3u8",
    ],
  );
  assert.throws(
    () =>
      rewriteVidfastHls(
        '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"\n',
        MASTER,
        PROXY,
        MEDIA_HOSTS,
      ),
    /DRM-protected/,
  );
});

test("the media relay injects Vidfast headers, preserves ranges and rewrites HLS", async () => {
  const proxy = encodeVidfastProxyTarget(MASTER, PROXY, MEDIA_HOSTS);
  let seen;
  const fetchImpl = async (input, options) => {
    seen = { input: new URL(input), options };
    return response("#EXTM3U\n1080p/index.m3u8\n", {
      contentType: "application/vnd.apple.mpegurl",
    });
  };
  const result = await proxyVidfastRequest(
    new Request(proxy, {
      headers: {
        origin: PROXY,
        referer: `${PROXY}/watch`,
        range: "bytes=0-1",
      },
    }),
    {
      allowedHosts: MEDIA_HOSTS,
      fetchImpl,
      vidfastOrigin: ORIGIN,
    },
  );
  const text = await result.text();

  assert.equal(result.status, 200);
  assert.equal(seen.options.headers.get("origin"), ORIGIN);
  assert.equal(seen.options.headers.get("referer"), `${ORIGIN}/`);
  assert.equal(seen.options.headers.get("range"), "bytes=0-1");
  assert.equal(result.headers.get("access-control-allow-origin"), "*");
  assert.match(text, /https:\/\/phantom\.example\/api\/sources\/vidfast\/proxy/);
});

test("a primed Vidfast manifest is reused for probe and attachment", async () => {
  const root = "https://media.example/title/primed-master.m3u8";
  let calls = 0;
  await primeVidfastMediaTarget(root, {
    allowedHosts: MEDIA_HOSTS,
    fetchImpl: async () => {
      calls += 1;
      return response("#EXTM3U\n#EXT-X-ENDLIST\n", {
        contentType: "application/vnd.apple.mpegurl",
      });
    },
    vidfastOrigin: ORIGIN,
  });
  const proxy = encodeVidfastProxyTarget(root, PROXY, MEDIA_HOSTS);
  const result = await proxyVidfastRequest(new Request(proxy), {
    allowedHosts: MEDIA_HOSTS,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("the primed manifest should be reused");
    },
    vidfastOrigin: ORIGIN,
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.match(await result.text(), /#EXTM3U/);
});
