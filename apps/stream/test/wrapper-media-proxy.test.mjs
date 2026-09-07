import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiscoveredCineSrcMediaUrl,
  assertDiscoveredVideasyMediaUrl,
  assertWrapperMediaUrl,
  decodeDiscoveredCineSrcMediaTarget,
  decodeDiscoveredVideasyMediaTarget,
  decodeWrapperMediaTarget,
  encodeDiscoveredCineSrcMediaTarget,
  encodeDiscoveredVideasyMediaTarget,
  encodeWrapperMediaTarget,
  primeWrapperMediaTarget,
  proxyWrapperCandidate,
  proxyWrapperMediaRequest,
  rewriteWrapperHls,
} from "../src/providers/wrapper-media-proxy.mjs";

const ROOT =
  "https://proxy.cinemaos.live/cors-m3u8-proxy?url=https%3A%2F%2Fmedia.example%2Fmaster.m3u8";
const CAPABILITY_SECRET = "test-only-capability-secret-with-32-bytes";
const NOW = 1_800_000_000_000;

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

test("the relay accepts only Yoru's public HLS path contract", () => {
  const token = "a".repeat(64);
  const root = `https://moon.ironwallnet.net/vd/${token}/index-s1080p-v1-a1.m3u8`;
  assert.equal(assertWrapperMediaUrl(root).hostname, "moon.ironwallnet.net");
  assert.equal(
    assertWrapperMediaUrl(
      `https://future-rotation17.site/vd/${token}/1080p/chunk.jpg`,
    ).hostname,
    "future-rotation17.site",
  );
  assert.throws(
    () => assertWrapperMediaUrl("https://future-rotation17.site/admin/chunk.jpg"),
    /not allowed/,
  );
});

test("rotated Videasy media is admitted by a signed, expiring capability", () => {
  const token = "a".repeat(64);
  const target =
    `https://moon.peakstorm.top/r2/cdn1/${token}/playlist.m3u8`;
  assert.equal(
    assertDiscoveredVideasyMediaUrl(target).hostname,
    "moon.peakstorm.top",
  );
  const proxy = encodeDiscoveredVideasyMediaTarget(
    target,
    "https://phantom.example",
    { secret: CAPABILITY_SECRET, now: NOW, ttlMs: 60_000 },
  );
  const params = new URL(proxy).searchParams;
  assert.equal(
    decodeDiscoveredVideasyMediaTarget(
      params.get("target"),
      params.get("expires"),
      params.get("signature"),
      { secret: CAPABILITY_SECRET, now: NOW + 30_000 },
    ).href,
    target,
  );
  assert.throws(
    () =>
      decodeDiscoveredVideasyMediaTarget(
        params.get("target"),
        params.get("expires"),
        params.get("signature"),
        { secret: `${CAPABILITY_SECRET}-tampered`, now: NOW },
      ),
    /signature is invalid/,
  );
  assert.throws(
    () => assertDiscoveredVideasyMediaUrl(
      "https://moon.peakstorm.top/admin/status",
    ),
    /not allowed/,
  );
  assert.throws(
    () => assertDiscoveredVideasyMediaUrl(
      `https://peakstorm.top/r2/cdn1/${token}/playlist.m3u8`,
    ),
    /not allowed/,
  );
});

test("local development can mint rotating media capabilities without setup", () => {
  const token = "d".repeat(64);
  const target =
    `https://moon.localdevrotation.top/r2/cdn1/${token}/playlist.m3u8`;
  const proxy = encodeDiscoveredVideasyMediaTarget(
    target,
    "http://localhost:3001",
    { now: NOW, ttlMs: 60_000 },
  );
  const params = new URL(proxy).searchParams;
  assert.equal(
    decodeDiscoveredVideasyMediaTarget(
      params.get("target"),
      params.get("expires"),
      params.get("signature"),
      { now: NOW + 30_000 },
    ).href,
    target,
  );
});

test("CineSrc capabilities follow discovered public media origins", () => {
  const first = "https://nebula-rotation.example/hls/token-a/master.m3u8";
  const next = "https://unknown-next.example/media/token-b/index.bin";
  for (const target of [first, next]) {
    assert.equal(assertDiscoveredCineSrcMediaUrl(target).href, target);
    const proxy = encodeDiscoveredCineSrcMediaTarget(
      target,
      "https://phantom.example",
      { secret: CAPABILITY_SECRET, now: NOW, ttlMs: 60_000 },
    );
    const params = new URL(proxy).searchParams;
    assert.equal(params.get("source"), "cinesrc");
    assert.equal(
      decodeDiscoveredCineSrcMediaTarget(
        params.get("target"),
        params.get("expires"),
        params.get("signature"),
        { secret: CAPABILITY_SECRET, now: NOW + 30_000 },
      ).href,
      target,
    );
  }
  for (const target of [
    "http://media.example/master.m3u8",
    "https://localhost/master.m3u8",
    "https://127.0.0.1/master.m3u8",
    "https://service.local/master.m3u8",
  ]) {
    assert.throws(() => assertDiscoveredCineSrcMediaUrl(target));
  }
});

test("CineSrc relays disguised child manifests with its player origin", async () => {
  const root = "https://rotating-media.example/hls/token/master.m3u8";
  const child = "https://rotating-media.example/hls/token/1080p/playlist.jpg";
  const segment = "https://rotating-media.example/hls/token/1080p/segment-1.ts";
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("origin"), "https://cinesrc.st");
    assert.equal(headers.get("referer"), "https://cinesrc.st/");
    if (url.href === root) {
      return response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n1080p/playlist.jpg\n");
    }
    if (url.href === child) {
      return response("#EXTM3U\n#EXTINF:6,\nsegment-1.ts\n", {
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (url.href === segment) {
      assert.equal(headers.get("range"), "bytes=0-3");
      return new Response(new Uint8Array([0x47, 1, 2, 3]), {
        status: 206,
        headers: { "content-type": "video/mp2t" },
      });
    }
    throw new Error(`Unexpected target ${url}`);
  };
  const rootProxy = encodeDiscoveredCineSrcMediaTarget(
    root,
    "https://phantom.example",
    { secret: CAPABILITY_SECRET, now: NOW },
  );
  const rootResponse = await proxyWrapperMediaRequest(new Request(rootProxy), {
    fetchImpl,
    secret: CAPABILITY_SECRET,
    now: NOW,
  });
  assert.equal(rootResponse.status, 200);
  const childProxy = (await rootResponse.text()).split("\n").find(
    (line) => line.startsWith("https://phantom.example/"),
  );
  assert.ok(childProxy);

  const childResponse = await proxyWrapperMediaRequest(new Request(childProxy), {
    fetchImpl,
    secret: CAPABILITY_SECRET,
    now: NOW,
  });
  assert.equal(childResponse.status, 200);
  assert.equal(
    childResponse.headers.get("content-type"),
    "application/vnd.apple.mpegurl; charset=utf-8",
  );
  const segmentProxy = (await childResponse.text()).split("\n").find(
    (line) => line.startsWith("https://phantom.example/"),
  );
  assert.ok(segmentProxy);

  const segmentResponse = await proxyWrapperMediaRequest(
    new Request(segmentProxy, { headers: { range: "bytes=0-3" } }),
    { fetchImpl, secret: CAPABILITY_SECRET, now: NOW },
  );
  assert.equal(segmentResponse.status, 206);
  assert.deepEqual(
    [...new Uint8Array(await segmentResponse.arrayBuffer())],
    [0x47, 1, 2, 3],
  );
});

test("CineSrc manifests cannot delegate their capability to another origin", async () => {
  const root = "https://rotating-media.example/hls/other-token/master.m3u8";
  const proxy = encodeDiscoveredCineSrcMediaTarget(
    root,
    "https://phantom.example",
    { secret: CAPABILITY_SECRET, now: NOW },
  );
  const result = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl: async () => response(
      "#EXTM3U\nhttps://different-origin.example/private/segment.ts\n",
    ),
    secret: CAPABILITY_SECRET,
    now: NOW,
  });
  assert.equal(result.status, 502);
  assert.match(await result.text(), /unsafe URI/);
});

test("a trusted rotated manifest can move segments to its current public host", () => {
  const token = "e".repeat(80);
  const child =
    `https://quietraven.top/r2/cdn2/${token}/1080p/xk.jpg`;
  const proxy = encodeDiscoveredVideasyMediaTarget(
    child,
    "https://phantom.example",
    {
      allowRotatedChild: true,
      now: NOW,
      secret: CAPABILITY_SECRET,
    },
  );
  const params = new URL(proxy).searchParams;
  assert.equal(
    decodeDiscoveredVideasyMediaTarget(
      params.get("target"),
      params.get("expires"),
      params.get("signature"),
      { now: NOW, secret: CAPABILITY_SECRET },
    ).hostname,
    "quietraven.top",
  );
  assert.throws(
    () =>
      encodeDiscoveredVideasyMediaTarget(
        "https://quietraven.top/admin/xk.jpg",
        "https://phantom.example",
        { allowRotatedChild: true, secret: CAPABILITY_SECRET },
      ),
    /not allowed/,
  );
  assert.throws(
    () =>
      encodeDiscoveredVideasyMediaTarget(
        `https://quietraven.example/r2/cdn2/${token}/1080p/xk.jpg`,
        "https://phantom.example",
        { allowRotatedChild: true, secret: CAPABILITY_SECRET },
      ),
    /not allowed/,
  );
});

test("a trusted rotated manifest can move fMP4 media to a vd child host", () => {
  const token = "v".repeat(96);
  const init = `https://darkgate.top/vd/${token}/init-s1080p-v1-a1.mp4`;
  const segment = `https://darkgate.top/vd/${token}/seg-17-s1080p-v1-a1.m4s`;

  for (const child of [init, segment]) {
    const capability = encodeDiscoveredVideasyMediaTarget(
      child,
      "https://phantom.example",
      { allowRotatedChild: true, secret: CAPABILITY_SECRET },
    );
    const url = new URL(capability);
    assert.equal(
      decodeDiscoveredVideasyMediaTarget(
        url.searchParams.get("target"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
        { secret: CAPABILITY_SECRET },
      ).href,
      child,
    );
  }

  assert.throws(
    () =>
      encodeDiscoveredVideasyMediaTarget(
        `https://darkgate.top/vd/${token}/arbitrary-file.m4s`,
        "https://phantom.example",
        { allowRotatedChild: true, secret: CAPABILITY_SECRET },
      ),
    /not allowed/,
  );
});

test("a rotated fMP4 manifest relays its map and media segments", () => {
  // Current upstream manifests use 60-character tokens, below the old 64 minimum.
  const token = "m".repeat(60);
  const root =
    `https://moon.peakstorm.top/vd/${token}/index-s1080p-v1-a1.m3u8`;
  const init = `https://darkgate.top/vd/${token}/init-s1080p-v1-a1.mp4`;
  const segment = `https://darkgate.top/vd/${token}/seg-1-s1080p-v1-a1.m4s`;
  const rewritten = rewriteWrapperHls(
    `#EXTM3U\n#EXT-X-MAP:URI="${init}"\n#EXTINF:6.006,\n${segment}\n`,
    root,
    "https://phantom.example",
    { now: NOW, secret: CAPABILITY_SECRET },
  );
  const relayed = rewritten.match(
    /https:\/\/phantom\.example\/api\/sources\/relay-media\?[^\s"]+/g,
  );

  assert.equal(relayed?.length, 2);
  assert.deepEqual(
    relayed.map((value) => {
      const url = new URL(value);
      return decodeDiscoveredVideasyMediaTarget(
        url.searchParams.get("target"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
        { now: NOW, secret: CAPABILITY_SECRET },
      ).href;
    }),
    [init, segment],
  );
});

test("rotated Videasy manifests keep every child behind signed capabilities", async () => {
  const token = "b".repeat(64);
  const root = `https://moon.peakstorm.top/r2/cdn1/${token}/playlist.m3u8`;
  const child = `https://moon.peakstorm.top/r2/cdn1/${token}/segment-1.ts`;
  const proxy = encodeDiscoveredVideasyMediaTarget(
    root,
    "https://phantom.example",
    { secret: CAPABILITY_SECRET, now: NOW },
  );
  const manifest = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl: async (_input, options) => {
      assert.equal(options.headers.get("origin"), "https://player.videasy.to");
      return response(`#EXTM3U\n${child}\n`);
    },
    secret: CAPABILITY_SECRET,
    now: NOW,
  });
  assert.equal(manifest.status, 200);
  const encodedChild = (await manifest.text()).match(
    /https:\/\/[^\s]+/,
  )?.[0];
  assert.ok(encodedChild);
  const params = new URL(encodedChild).searchParams;
  assert.equal(
    decodeDiscoveredVideasyMediaTarget(
      params.get("target"),
      params.get("expires"),
      params.get("signature"),
      { secret: CAPABILITY_SECRET, now: NOW },
    ).href,
    child,
  );
});

test("signed Videasy media can use an authenticated external egress hop", async () => {
  const token = "q".repeat(96);
  const root =
    `https://moon.peakstorm.top/vd/${token}/index-s1080p-v1-a1.m3u8`;
  const child = `https://darkgate.top/vd/${token}/seg-1-s1080p-v1-a1.m4s`;
  const proxy = encodeDiscoveredVideasyMediaTarget(
    root,
    "https://phantom.example",
    { secret: CAPABILITY_SECRET, now: NOW },
  );
  const calls = [];
  const manifest = await proxyWrapperMediaRequest(new Request(proxy), {
    now: NOW,
    relayFetchImpl: async (input, options) => {
      calls.push({ input: String(input), options });
      return response(`#EXTM3U\n#EXTINF:6,\n${child}\n`);
    },
    relaySecret: CAPABILITY_SECRET,
    relayUrl: "https://resolver.example/v1/fetch",
    secret: CAPABILITY_SECRET,
  });

  assert.equal(manifest.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://resolver.example/v1/fetch");
  assert.equal(
    calls[0].options.headers.get("authorization"),
    `Bearer ${CAPABILITY_SECRET}`,
  );
  assert.equal(
    Buffer.from(
      calls[0].options.headers.get("x-phantom-target"),
      "base64url",
    ).toString("utf8"),
    root,
  );
  assert.match(
    await manifest.text(),
    /https:\/\/phantom\.example\/api\/sources\/relay-media/,
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

test("Yoru manifests and rotating children stay relayed with player headers", async () => {
  const token = "b".repeat(64);
  const root = `https://moon.ironwallnet.net/vd/${token}/index-s1080p-v1-a1.m3u8`;
  const child = `https://future-rotation17.site/vd/${token}/1080p/chunk.jpg`;
  const proxy = encodeWrapperMediaTarget(root, "https://phantom.example");
  let seen;
  const manifest = await proxyWrapperMediaRequest(new Request(proxy), {
    fetchImpl: async (input, options) => {
      seen = { input: new URL(input), options };
      return response(`#EXTM3U\n${child}\n`);
    },
  });
  const text = await manifest.text();
  const encoded = text.match(/target=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(encoded);
  assert.equal(decodeWrapperMediaTarget(encoded).href, child);
  assert.equal(seen.options.headers.get("origin"), "https://player.videasy.to");
  assert.equal(seen.options.headers.get("referer"), "https://player.videasy.to/");
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

test("CineSrc media uses its authenticated VPS hop and keeps child capabilities", async () => {
  const root = 'https://nebula.example/media/test/master.m3u8';
  const proxy = encodeDiscoveredCineSrcMediaTarget(root, 'https://phantom.example', {secret:CAPABILITY_SECRET,now:NOW});
  const calls=[];
  const options={now:NOW,secret:CAPABILITY_SECRET,relaySecret:CAPABILITY_SECRET,
    cinesrcRelayUrl:'https://resolver.example/v1/cinesrc/fetch',
    fetchImpl:async()=>{throw new Error('Must not fetch media from the Worker');},
    relayFetchImpl:async(url,init)=>{
      calls.push({url:String(url),init});
      return calls.length === 1 ? response('#EXTM3U\n#EXTINF:6,\nseg.ts\n')
        : new Response(new Uint8Array([1,2,3]),{status:206,headers:{'content-type':'video/mp2t','content-range':'bytes 0-2/3'}});
    },
  };
  const manifest=await proxyWrapperMediaRequest(new Request(proxy),options);
  assert.equal(manifest.status,200);
  const child=(await manifest.text()).split('\n').find(line=>line.startsWith('https://'));
  const media=await proxyWrapperMediaRequest(new Request(child,{headers:{range:'bytes=0-2'}}),options);
  assert.equal(media.status,206);
  assert.equal(media.headers.get('content-range'),'bytes 0-2/3');
  assert.deepEqual([...new Uint8Array(await media.arrayBuffer())],[1,2,3]);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.url,options.cinesrcRelayUrl);
    assert.equal(call.init.headers.get('authorization'),`Bearer ${CAPABILITY_SECRET}`);
    assert.equal(call.init.redirect,'manual');
  }
  assert.equal(calls[1].init.headers.get('x-phantom-range'),'bytes=0-2');
  assert.equal(Buffer.from(calls[1].init.headers.get('x-phantom-target'),'base64url').toString(),'https://nebula.example/media/test/seg.ts');
  const invalid=new URL(child);invalid.searchParams.set('signature','invalid');
  assert.equal((await proxyWrapperMediaRequest(new Request(invalid),options)).status,400);
  assert.equal(calls.length,2);
});
