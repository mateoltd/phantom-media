import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDSRC_FAILURE_DOMAIN,
  createVidsrcResolver,
  extractVidsrcIframe,
  extractVidsrcMasterTemplates,
  extractVidsrcPlayerPath,
  resolveVidsrc,
} from "../src/providers/vidsrc.mjs";
import {
  assertVidsrcMediaUrl,
  decodeVidsrcProxyTarget,
  encodeVidsrcProxyTarget,
  proxyVidsrcRequest,
  rewriteVidsrcHls,
  vidsrcMediaHosts,
} from "../src/providers/vidsrc-proxy.mjs";

const TOKEN =
  "eyJ0eXAiOiJKV1QifQ.eyJleHAiOjIwMDAwMDAwMDB9.public-signature";
const MEDIA_HOSTS = new Set(["media.example"]);
const MASTER =
  `https://media.example/pl/opaque/master.m3u8?token=__TOKEN__`;

test("the checked-in VidSrc media rotation includes the current public host", () => {
  const hosts = vidsrcMediaHosts();
  for (const host of [
    "verdantvagary.website",
    "peregrinepalaver.space",
    "scintillatingsycophant.space",
    "kinesiskaleidoscope.website",
    "loquaciouslexicon.website",
    "metonymicmosaic.website",
    "demesnedialectic.website",
    "xoanonymorpha.site",
    "jejunejamboree.website",
    "xeriscapexanadu.site",
  ]) {
    assert.equal(hosts.has(host), true, `${host} is missing`);
  }
});

function response(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html", ...init.headers },
    ...init,
  });
}

function resolverFetch() {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.hostname === "embed.example") {
      return response(
        '<iframe src="//orchestrator.example/rcp/opaque" id="player_iframe"></iframe>',
      );
    }
    if (url.pathname.startsWith("/rcp/")) {
      return response(
        `<script>$("<iframe>", {src: '/prorcp/opaque'});</script>`,
      );
    }
    if (url.pathname.startsWith("/prorcp/")) {
      return response(
        `<script>
          var master_urls = "${MASTER} or ${MASTER.replace("opaque", "backup")}";
          $.get("https://media.example/generate.php", function (token) {});
        </script>`,
      );
    }
    if (url.pathname === "/generate.php") {
      return response(TOKEN, { headers: { "content-type": "text/plain" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { calls, fetchImpl };
}

test("VidSrc parser follows the public iframe chain without decoding tokens", () => {
  assert.equal(
    extractVidsrcIframe(
      '<iframe class="player" src="//orchestrator.example/rcp/a" id="player_iframe"></iframe>',
    ),
    "//orchestrator.example/rcp/a",
  );
  assert.equal(
    extractVidsrcPlayerPath(`$("<iframe>", { src: '/prorcp/b' });`),
    "/prorcp/b",
  );
  assert.deepEqual(
    extractVidsrcMasterTemplates(
      `var master_urls = "${MASTER} or ${MASTER}";`,
    ),
    [MASTER],
  );
});

test("VidSrc resolution returns same-domain HLS relay candidates", async () => {
  const { calls, fetchImpl } = resolverFetch();
  const result = await resolveVidsrc(
    { type: "movie", tmdbId: 10378 },
    {
      embedOrigins: ["https://embed.example"],
      orchestrationHosts: ["orchestrator.example"],
      mediaHosts: MEDIA_HOSTS,
      proxyOrigin: "https://phantom.example",
      fetchImpl,
    },
  );

  assert.equal(result.variants.length, 2);
  assert.equal(result.subtitles.length, 0);
  assert.equal(result.expiresAt, 2_000_000_000_000);
  for (const variant of result.variants) {
    assert.equal(variant.type, "hls");
    assert.equal(variant.delivery, "full-relay");
    assert.equal(variant.failureDomain, VIDSRC_FAILURE_DOMAIN);
    assert.equal(new URL(variant.url).origin, "https://phantom.example");
    const upstream = decodeVidsrcProxyTarget(
      new URL(variant.url).searchParams.get("target"),
      MEDIA_HOSTS,
    );
    assert.equal(upstream.hostname, "media.example");
    assert.equal(upstream.searchParams.get("token"), TOKEN);
  }

  assert.deepEqual(
    calls.map((call) => call.url.pathname),
    [
      "/embed/movie/10378",
      "/rcp/opaque",
      "/prorcp/opaque",
      "/generate.php",
    ],
  );
  assert.equal(calls[1].options.headers.referer.startsWith("https://embed.example/"), true);
  assert.equal(calls[2].options.headers.referer, "https://orchestrator.example/rcp/opaque");
});

test("the registry factory normalizes VidSrc under opaque provider id n1", async () => {
  const { fetchImpl } = resolverFetch();
  const resolve = createVidsrcResolver("n1");
  const result = await resolve(
    { type: "movie", tmdbId: 10378 },
    {
      embedOrigins: ["https://embed.example"],
      orchestrationHosts: ["orchestrator.example"],
      mediaHosts: MEDIA_HOSTS,
      proxyOrigin: "https://phantom.example",
      fetchImpl,
    },
  );
  assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every((candidate) => candidate.server === "n1"));
  assert.ok(result.candidates.every((candidate) => candidate.type === "hls"));
});

test("TV resolution uses the documented query endpoint", async () => {
  const { calls, fetchImpl } = resolverFetch();
  await resolveVidsrc(
    { type: "tv", tmdbId: 1399, season: 1, episode: 2 },
    {
      embedOrigins: ["https://embed.example"],
      orchestrationHosts: ["orchestrator.example"],
      mediaHosts: MEDIA_HOSTS,
      proxyOrigin: "https://phantom.example",
      fetchImpl,
    },
  );
  const url = calls[0].url;
  assert.equal(url.pathname, "/embed/tv");
  assert.equal(url.searchParams.get("tmdb"), "1399");
  assert.equal(url.searchParams.get("season"), "1");
  assert.equal(url.searchParams.get("episode"), "2");
});

test("proxy targets are restricted to known media paths and hosts", () => {
  const upstream = MASTER.replace("__TOKEN__", TOKEN);
  const proxy = encodeVidsrcProxyTarget(
    upstream,
    "https://phantom.example",
    MEDIA_HOSTS,
  );
  const decoded = decodeVidsrcProxyTarget(
    new URL(proxy).searchParams.get("target"),
    MEDIA_HOSTS,
  );
  assert.equal(decoded.href, upstream);
  assert.throws(
    () =>
      assertVidsrcMediaUrl(
        `https://private.example/pl/a/master.m3u8?token=${TOKEN}`,
        MEDIA_HOSTS,
      ),
    /not allowed/,
  );
  assert.throws(
    () =>
      assertVidsrcMediaUrl(
        `https://media.example/admin?token=${TOKEN}`,
        MEDIA_HOSTS,
      ),
    /path is not allowed/,
  );
});

test("HLS rewriting covers URI lines and quoted URI attributes", () => {
  const upstream = MASTER.replace("__TOKEN__", TOKEN);
  const body = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/index.m3u8?token=${TOKEN}"
#EXT-X-KEY:METHOD=AES-128,URI="/content/key.bin?token=${TOKEN}"
video/index.m3u8?token=${TOKEN}
`;
  const rewritten = rewriteVidsrcHls(
    body,
    upstream,
    "https://phantom.example",
    MEDIA_HOSTS,
  );
  const targets = [...rewritten.matchAll(/target=([A-Za-z0-9_-]+)/g)].map(
    (match) => decodeVidsrcProxyTarget(match[1], MEDIA_HOSTS),
  );
  assert.equal(targets.length, 3);
  assert.equal(targets[0].pathname, "/pl/opaque/audio/index.m3u8");
  assert.equal(targets[1].pathname, "/content/key.bin");
  assert.equal(targets[2].pathname, "/pl/opaque/video/index.m3u8");
});

test("HLS rewriting refuses DRM key formats while permitting plain AES-128", () => {
  const upstream = MASTER.replace("__TOKEN__", TOKEN);
  const drm = `#EXTM3U
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="/content/key.bin?token=${TOKEN}"
video.ts?token=${TOKEN}
`;
  const fairplay = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,KEYFORMAT="com.apple.streamingkeydelivery",URI="/content/key.bin?token=${TOKEN}"
video.ts?token=${TOKEN}
`;

  assert.throws(
    () =>
      rewriteVidsrcHls(
        drm,
        upstream,
        "https://phantom.example",
        MEDIA_HOSTS,
      ),
    /DRM-protected/,
  );
  assert.throws(
    () =>
      rewriteVidsrcHls(
        fairplay,
        upstream,
        "https://phantom.example",
        MEDIA_HOSTS,
      ),
    /DRM-protected/,
  );
});

test("the media relay strips browser Origin and rewrites manifests", async () => {
  const upstream = MASTER.replace("__TOKEN__", TOKEN);
  const proxy = encodeVidsrcProxyTarget(
    upstream,
    "https://phantom.example",
    MEDIA_HOSTS,
  );
  let seen;
  const fetchImpl = async (input, options) => {
    seen = { input: new URL(input), options };
    return response(
      `#EXTM3U\n/content/title/page-0.html?token=${TOKEN}\n`,
      { headers: { "content-type": "application/vnd.apple.mpegurl" } },
    );
  };
  const request = new Request(proxy, {
    headers: {
      origin: "https://phantom.example",
      referer: "https://phantom.example/watch",
      range: "bytes=0-1",
    },
  });
  const result = await proxyVidsrcRequest(request, {
    allowedHosts: MEDIA_HOSTS,
    fetchImpl,
  });
  const text = await result.text();

  assert.equal(result.status, 200);
  assert.equal(result.headers.get("access-control-allow-origin"), "*");
  assert.equal(seen.options.headers.get("origin"), null);
  assert.equal(seen.options.headers.get("referer"), null);
  assert.equal(seen.options.headers.get("range"), "bytes=0-1");
  assert.match(text, /https:\/\/phantom\.example\/api\/sources\/vidsrc\/proxy/);
});

test("the media relay refreshes an egress-bound token once after 403", async () => {
  const upstream = MASTER.replace("__TOKEN__", TOKEN);
  const proxy = encodeVidsrcProxyTarget(
    upstream,
    "https://phantom.example",
    MEDIA_HOSTS,
  );
  const refreshed =
    "eyJ0eXAiOiJKV1QifQ.eyJleHAiOjIwMDAwMDAwMDF9.refreshed-signature";
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname === "/generate.php") return response(refreshed);
    if (url.searchParams.get("token") === TOKEN) {
      return response("expired", { status: 403 });
    }
    return response("#EXTM3U\n");
  };
  const result = await proxyVidsrcRequest(new Request(proxy), {
    allowedHosts: MEDIA_HOSTS,
    fetchImpl,
  });

  assert.equal(result.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].pathname, "/generate.php");
  assert.equal(calls[2].searchParams.get("token"), refreshed);
});
