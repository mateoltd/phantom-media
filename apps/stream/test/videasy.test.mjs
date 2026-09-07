import assert from "node:assert/strict";
import test from "node:test";
import {
  createVideasyResolver,
  decodeVideasyPayload,
  resolveVideasy,
  resolveVideasyRemotely,
} from "../src/providers/videasy.mjs";
import { failureDomainFor } from "../src/failure-domain.mjs";
import { decodeDiscoveredVideasyMediaTarget } from "../src/providers/wrapper-media-proxy.mjs";

const FIXTURE_SEED = "59515387.Yp6AKhi-9gCS4MlXglJ8Pw";
const FIXTURE_CIPHER =
  "RaXElv4tewdPFWvOlF1E9VIdz-m51AsWv0mPYMJGWjQApU5c6m40UZ70Xdc-dIQsoyQqX-VCSzjAXWZVMq4qvJNCdHCK60BJv0FxGVQB7beeVsyScVP0bxGkSqACIezdx2ee5bic2HVhNW6f1rsq-eD7bs5t6S9U-hOCycAOzURoWZO40kZoAVfc0LLCLuH7gWxuJ2pbihezdXInKk7IS-i9UqTXJOjs7hpqRyAbq8-UiGPhjdF-bOLm4fx9HiTiESBoy1hMlMEYIyMLfo8on20gKefCZczw7fzw3qpjw2xOqcNYeJmtBHJ0m1C45K1hj39vLu8Lk6CqfoLxAYP4D5KRT4oGZNf8-DX2B87CGM5JV40cDb6asehdxd7SFytCJsRqx0bh_v-2KUqG1zFcbwYDbUNG6kZbJPKLESUiXM1Vx8B6wK24wTF97Jx8PYm4OkYcaYeuqH5-g-UIdcG8J6EzdYX00hpW_Ptva8LW7jlSOnFBxRvkuypIELJRjoyZlgXImEdDTfw_HeKekNDArh0N";

const media = {
  type: "tv",
  tmdbId: 37680,
  imdbId: "tt1632701",
  title: "Suits",
  year: "2011",
  season: 7,
  episode: 6,
};
const CAPABILITY_SECRET = "test-only-capability-secret-with-32-bytes";

test("the checked-in Videasy v2 fixture authenticates and decrypts", () => {
  const payload = JSON.parse(
    decodeVideasyPayload(FIXTURE_CIPHER, FIXTURE_SEED, 37680),
  );
  assert.equal(payload.sources.length, 1);
  assert.equal(
    new URL(payload.sources[0].url).hostname,
    "peraspera.waltersamson74809.workers.dev",
  );
  assert.equal(payload.sources[0].quality, "1080p");
});

test("Videasy asks only Yoru and Breach and returns native HLS", async () => {
  const calls = [];
  const worker =
    "https://peraspera.waltersamson74809.workers.dev/" +
    "?payload=abcdefgh.ijklmnop&headers=qrstuvwx.yzABCDEF&type=m3u8";
  const yoru =
    `https://moon.ironwallnet.net/vd/${"A".repeat(40)}/master.m3u8`;
  const yoru1080 =
    `https://moon.ironwallnet.net/vd/${"A".repeat(40)}/index-s1080p-v1-a1.m3u8`;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === "/seed") {
      return new Response(JSON.stringify({ seed: FIXTURE_SEED, ttlMs: 30_000 }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/m4uhd/sources-with-title") {
      return new Response("breach-cipher");
    }
    if (url.pathname === "/cdn/sources-with-title") {
      return new Response("yoru-cipher");
    }
    return new Response("not found", { status: 404 });
  };

  const result = await resolveVideasy(media, {
    decodeImpl: (cipher) =>
      cipher === "breach-cipher"
        ? JSON.stringify({
            sources: [
              { url: worker, quality: "1080p" },
              { url: "https://example.com/not-videasy.m3u8" },
            ],
            subtitles: [],
          })
        : JSON.stringify({
            sources: [{ url: yoru1080, quality: "1080p" }],
            subtitles: [],
            playlist: yoru,
          }),
    fetchImpl,
    fresh: true,
  });

  assert.deepEqual(
    calls.map(({ url }) => url.pathname).sort(),
    ["/cdn/sources-with-title", "/m4uhd/sources-with-title", "/seed"],
  );
  assert.equal(calls[0].url.searchParams.get("mediaId"), "37680");
  for (const call of calls) {
    assert.equal(call.options.headers.origin, "https://player.videasy.to");
    assert.equal(call.options.headers.referer, "https://player.videasy.to/");
    assert.equal(call.options.redirect, "manual");
  }
  const sourceCall = calls.find(
    ({ url }) => url.pathname === "/cdn/sources-with-title",
  );
  assert.equal(sourceCall.url.searchParams.get("seasonId"), "7");
  assert.equal(sourceCall.url.searchParams.get("episodeId"), "6");
  assert.equal(sourceCall.url.searchParams.get("tmdbId"), "37680");
  assert.equal(result.variants.length, 3);
  assert.deepEqual(
    result.variants.map((variant) => new URL(variant.url).hostname),
    [
      "peraspera.waltersamson74809.workers.dev",
      "moon.ironwallnet.net",
      "moon.ironwallnet.net",
    ],
  );
  assert.notEqual(
    result.variants[0].failureDomain,
    result.variants[1].failureDomain,
  );
  assert.equal(result.variants[1].failureDomain, failureDomainFor("u9"));
  assert.equal(result.variants[1].deliveryMode, "resolver-full-relay");
});

test("the registry relays every Yoru variant and keeps direct renditions", async () => {
  const token = "Z".repeat(40);
  const resolver = createVideasyResolver("b5");
  const result = await resolver(media, {
    decodeImpl: (cipher) =>
      JSON.stringify(
        cipher === "breach"
          ? { sources: [] }
          : {
              sources: [
                {
                  url: `https://moon.ironwallnet.net/vd/${token}/index-s1080p-v1-a1.m3u8`,
                  quality: "1080p",
                },
                {
                  url: `https://moon.ironwallnet.net/vd/${token}/index-s720p-v1-a1.m3u8`,
                  quality: "720p",
                },
              ],
              playlist: `https://moon.ironwallnet.net/vd/${token}/master.m3u8`,
            },
      ),
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === "/seed") {
        return new Response(JSON.stringify({ seed: FIXTURE_SEED }));
      }
      return new Response(path.startsWith("/m4uhd/") ? "breach" : "yoru");
    },
    fresh: true,
    proxyOrigin: "https://phantom.example",
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].resolution, 1080);
  assert.ok(
    result.candidates.every(
      (candidate) =>
        new URL(candidate.url).origin === "https://phantom.example" &&
        candidate.deliveryMode === "resolver-full-relay",
    ),
  );
});

test("the registry resolver keeps Videasy under opaque Source 04 identity", async () => {
  const resolver = createVideasyResolver("b5");
  const result = await resolver(media, {
    decodeImpl: (cipher) =>
      JSON.stringify(
        cipher === "breach"
          ? {
              sources: [
                {
                  url:
                    "https://peraspera.waltersamson74809.workers.dev/" +
                    "?payload=abcdefgh.ijklmnop&headers=qrstuvwx.yzABCDEF",
                  quality: "1080p",
                },
              ],
            }
          : { sources: [] },
      ),
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === "/seed") {
        return new Response(JSON.stringify({ seed: FIXTURE_SEED }));
      }
      return new Response(path.startsWith("/m4uhd/") ? "breach" : "yoru");
    },
    fresh: true,
    proxyOrigin: "https://phantom.example",
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].server, "b5");
  assert.equal(result.candidates[0].serverLabel, "Source 04");
  assert.equal(result.candidates[0].deliveryMode, "resolver-full-relay");
  assert.equal(
    new URL(result.candidates[0].url).origin,
    "https://phantom.example",
  );
});

test("Videasy accepts a rotated Yoru contract without opening a general proxy", async () => {
  const token = "R".repeat(64);
  const rotated =
    `https://moon.peakstorm.top/r2/cdn1/${token}/playlist.m3u8`;
  const resolver = createVideasyResolver("b5");
  const result = await resolver(media, {
    decodeImpl: (cipher) =>
      JSON.stringify(
        cipher === "breach"
          ? { sources: [] }
          : { sources: [{ url: rotated, quality: "1080p" }] },
      ),
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === "/seed") {
        return new Response(JSON.stringify({ seed: FIXTURE_SEED }));
      }
      return new Response(path.startsWith("/m4uhd/") ? "breach" : "yoru");
    },
    fresh: true,
    proxyOrigin: "https://phantom.example",
    proxySecret: CAPABILITY_SECRET,
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].server, "b5");
  assert.equal(result.candidates[0].deliveryMode, "resolver-full-relay");
  const proxy = new URL(result.candidates[0].url);
  assert.equal(proxy.origin, "https://phantom.example");
  assert.equal(
    decodeDiscoveredVideasyMediaTarget(
      proxy.searchParams.get("target"),
      proxy.searchParams.get("expires"),
      proxy.searchParams.get("signature"),
      { secret: CAPABILITY_SECRET },
    ).href,
    rotated,
  );
});

test("the trusted resolver hop is authenticated and revalidates returned URLs", async () => {
  const token = "S".repeat(64);
  const rotated = `https://moon.peakstorm.top/r2/cdn1/${token}/playlist.m3u8`;
  const calls = [];
  const result = await resolveVideasyRemotely(media, {
    resolverUrl: "https://resolver.example/v1/resolve",
    resolverSecret: "test-only-resolver-secret-with-32-bytes",
    fetchImpl: async (input, options) => {
      calls.push({ input: String(input), options });
      return new Response(JSON.stringify({
        variants: [
          { url: rotated, quality: "1080p" },
          { url: "https://attacker.example/video.m3u8", quality: "2160p" },
        ],
        subtitles: [],
        latencyMs: 123,
      }));
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://resolver.example/v1/resolve");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer test-only-resolver-secret-with-32-bytes",
  );
  assert.equal(result.variants.length, 1);
  assert.equal(result.variants[0].url, rotated);
  assert.equal(result.latencyMs, 123);
});

test("the trusted resolver hop fails closed without a strong secret", async () => {
  await assert.rejects(
    resolveVideasyRemotely(media, {
      resolverUrl: "https://resolver.example/v1/resolve",
      resolverSecret: "short",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    }),
    (error) =>
      error instanceof Error &&
      error.name === "VideasyError" &&
      error.details?.stage === "resolver-config",
  );
});
