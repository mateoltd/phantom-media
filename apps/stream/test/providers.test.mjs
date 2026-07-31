import assert from "node:assert/strict";
import test from "node:test";
import {
  PROVIDER_CATALOG,
  PROVIDER_KINDS,
  providerDescriptor,
} from "../src/providers/catalog.mjs";
import { normalizeVariants } from "../src/providers/normalize.mjs";
import { getProvider, listProviders } from "../src/providers/registry.mjs";
import {
  ACTIVE_SOURCE_IDS,
  AUTOMATIC_SOURCE_IDS,
  RETIRED_SOURCE_IDS,
  SOURCE_IDS,
  SOURCE_ROSTER,
  parseStremioManifestUrl,
  sourceAlias,
} from "../src/source-ids.mjs";
import {
  capacityDomainsFor,
  asSettledByFailureDomain,
  failureDomainFor,
  independentWave,
  shareFailureCapacity,
} from "../src/failure-domain.mjs";
import { createStremioResolver } from "../src/providers/stremio.mjs";
import { sourcePlaybackHints } from "../src/source-observations.mjs";

test("every catalogued source has something that can answer for it", () => {
  const providers = listProviders();
  assert.equal(providers.length, PROVIDER_CATALOG.length);
  for (const descriptor of PROVIDER_CATALOG) {
    const provider = getProvider(descriptor.id);
    assert.ok(provider, `no provider for ${descriptor.id}`);
    assert.equal(typeof provider.resolve, "function");
    assert.ok(PROVIDER_KINDS.includes(provider.kind));
  }
});

test("an unknown source is refused rather than guessed at", () => {
  assert.equal(getProvider("nope"), null);
  assert.equal(providerDescriptor("nope"), null);
});

test("source aliases are positional and stable", () => {
  assert.equal(sourceAlias(SOURCE_IDS[0]), "Source 01");
  assert.equal(sourceAlias(SOURCE_IDS[6]), "Source 07");
  for (const descriptor of PROVIDER_CATALOG) {
    const position = SOURCE_IDS.indexOf(descriptor.id);
    assert.ok(position >= 0, `${descriptor.id} is not on the roster`);
    assert.equal(
      descriptor.label,
      `Source ${String(position + 1).padStart(2, "0")}`,
    );
  }
});

test("a retired source is off the roster everywhere at once", () => {
  assert.equal(
    PROVIDER_CATALOG.length,
    ACTIVE_SOURCE_IDS.length,
  );
  for (const id of RETIRED_SOURCE_IDS) {
    assert.ok(SOURCE_IDS.includes(id), `${id} left the roster`);
    assert.equal(providerDescriptor(id), null);
    assert.equal(getProvider(id), null);
    assert.ok(!SOURCE_ROSTER.some((entry) => entry.id === id));
    assert.ok(!ACTIVE_SOURCE_IDS.includes(id));
  }
});

test("the evidenced Source 03/05 duplicate stays retired without shifting aliases", () => {
  assert.ok(RETIRED_SOURCE_IDS.has("p6"));
  assert.equal(sourceAlias("p6"), "Source 05");
  assert.ok(!ACTIVE_SOURCE_IDS.includes("va"));
  assert.ok(!ACTIVE_SOURCE_IDS.includes("p6"));
});

test("the temporary production roster contains only native Vidfast and Videasy", () => {
  assert.deepEqual(ACTIVE_SOURCE_IDS, ["u9", "b5"]);
  assert.equal(sourceAlias("u9"), "Source 28");
  assert.equal(sourceAlias("b5"), "Source 04");
  assert.equal(providerDescriptor("u9")?.kind, "vidfast");
  assert.equal(providerDescriptor("b5")?.kind, "videasy");
});

test("embed-only research ids are retired without renumbering the roster", () => {
  assert.deepEqual(
    SOURCE_ROSTER.filter((entry) => entry.automatic).map((entry) => entry.id),
    AUTOMATIC_SOURCE_IDS,
  );
  for (const id of ["r6", "m8", "d4", "w3", "g6", "x1", "j7", "c2", "l5"]) {
    assert.ok(RETIRED_SOURCE_IDS.has(id));
    assert.equal(providerDescriptor(id), null);
    assert.equal(getProvider(id), null);
  }
});

test("providers expose opaque health and capacity fingerprints", () => {
  for (const descriptor of PROVIDER_CATALOG) {
    assert.match(descriptor.failureDomain, /^fd-[0-9a-f]{8}$/);
    assert.ok(descriptor.capacityDomains.includes(descriptor.failureDomain));
  }
  assert.equal(failureDomainFor("va"), failureDomainFor("p6"));
  assert.ok(shareFailureCapacity("va", "p6"));
  assert.ok(!shareFailureCapacity("va", "b5"));
  assert.ok(!shareFailureCapacity("va", "n1"));
});

test("the first wave has one representative per shared capacity domain", () => {
  const scheduled = independentWave(["va", "p6", "b5", "n1", "k9"], 5);
  assert.deepEqual(scheduled.ordered.slice(0, 4), [
    "va",
    "b5",
    "n1",
    "k9",
  ]);
  assert.equal(scheduled.wave, 4);
  assert.ok(capacityDomainsFor("va").some((domain) =>
    capacityDomainsFor("p6").includes(domain),
  ));
});

test("shared-capacity sources never overlap while the race is running", async () => {
  const starts = [];
  const releases = new Map();
  const iterator = asSettledByFailureDomain(
    ["va", "p6", "n1"],
    3,
    (sourceId) => {
      starts.push(sourceId);
      return new Promise((resolve) => releases.set(sourceId, resolve));
    },
  );
  const first = iterator.next();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(starts, ["va", "n1"]);

  releases.get("n1")("n1");
  await first;
  assert.deepEqual(starts, ["va", "n1"]);

  const second = iterator.next();
  releases.get("va")("va");
  await second;
  assert.deepEqual(starts, ["va", "n1", "p6"]);
  releases.get("p6")("p6");
  await iterator.next();
  await iterator.return();
});

test("Stremio configuration accepts only public HTTPS manifest endpoints", () => {
  assert.equal(
    parseStremioManifestUrl("https://addon.example/manifest.json"),
    "https://addon.example/manifest.json",
  );
  for (const value of [
    "http://addon.example/manifest.json",
    "https://localhost/manifest.json",
    "https://user:pass@addon.example/manifest.json",
    "https://addon.example/manifest.json?token=secret",
    "https://addon.example/catalog.json",
  ]) {
    assert.throws(() => parseStremioManifestUrl(value), TypeError);
  }
});

test("the Stremio adapter validates the manifest and classifies non-direct streams", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    const body = requested.length === 1
      ? {
          id: "public.example",
          name: "Public fixture",
          version: "1.0.0",
          resources: [{ name: "stream", types: ["movie"] }],
        }
      : {
          streams: [
            { url: "https://media.example/movie/master.m3u8", name: "1080p" },
            {
              url: "https://headers.example/movie/master.m3u8",
              behaviorHints: { proxyHeaders: { request: { Referer: "x" } } },
            },
            { externalUrl: "https://player.example/watch/1" },
            { url: "javascript:alert(1)" },
          ],
        };
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  };
  const resolve = createStremioResolver("t0", {
    manifestUrl: "https://addon.example/manifest.json",
    fetchImpl,
  });
  const result = await resolve({
    type: "movie",
    tmdbId: 10378,
    imdbId: "tt1254207",
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, "https://media.example/movie/master.m3u8");
  assert.equal(result.candidates[0].deliveryMode, "native-direct");
  assert.deepEqual(
    result.alternates.map((entry) => entry.classification),
    ["proxy", "external", "proxy"],
  );
  assert.deepEqual(requested, [
    "https://addon.example/manifest.json",
    "https://addon.example/stream/movie/tt1254207.json",
  ]);
});

test("catalogued ids are unique", () => {
  assert.equal(new Set(PROVIDER_CATALOG.map((d) => d.id)).size, PROVIDER_CATALOG.length);
});

test("source observations travel with every normalized candidate", () => {
  const hints = sourcePlaybackHints("z2");
  assert.equal(sourceAlias("z2"), "Source 09");
  assert.deepEqual(hints.burnedInSubtitles.languages, ["vi"]);
});

test("no third party's name survives normalisation", () => {
  const candidates = normalizeVariants(
    [
      { url: "https://helios.example/a.m3u8", type: "Helios", quality: "1080p" },
      { url: "https://cdn.example/b.mp4", type: "mp4", quality: "720" },
    ],
    "va",
  );

  assert.equal(candidates.length, 2);
  for (const candidate of candidates) {
    for (const [field, value] of Object.entries(candidate)) {
      if (field === "url") continue;
      assert.ok(
        !String(value).toLowerCase().includes("helios"),
        `"${field}" leaked an upstream name: ${String(value)}`,
      );
    }
  }
});

test("a provider cannot name itself", () => {
  const [candidate] = normalizeVariants(
    [
      {
        url: "https://play.example/a.m3u8",
        type: "hls",
        server: "Helios",
        serverLabel: "Helios Fast CDN",
        provider: "helios",
        providerLabel: "Helios",
        score: 99_999,
      },
    ],
    "u9",
  );

  assert.equal(candidate.server, "u9");
  assert.equal(candidate.serverLabel, "Source 28");
  assert.equal(candidate.provider, "u9");
  assert.equal(candidate.providerLabel, "Source 28");
  assert.ok(candidate.score < 1_000);
});

test("resolution is read from whatever the variant calls its quality", () => {
  const candidates = normalizeVariants(
    [
      { url: "https://play.example/a.m3u8", type: "hls", quality: "1080p" },
      { url: "https://play.example/b.m3u8", type: "hls", quality: 720 },
      { url: "https://play.example/c.m3u8", type: "hls", quality: "auto" },
    ],
    "va",
  );
  const byUrl = Object.fromEntries(candidates.map((c) => [c.url, c]));
  assert.equal(byUrl["https://play.example/a.m3u8"].resolution, 1080);
  assert.equal(byUrl["https://play.example/b.m3u8"].resolution, 720);
  assert.equal(byUrl["https://play.example/c.m3u8"].resolution, null);
});

test("the container is inferred from the address when upstream will not say", () => {
  const candidates = normalizeVariants(
    [
      { url: "https://play.example/a.m3u8" },
      { url: "https://play.example/b.mpd" },
      { url: "https://play.example/c.mp4" },
      { url: "https://play.example/d" },
    ],
    "va",
  );
  const types = Object.fromEntries(candidates.map((c) => [c.url, c.type]));
  assert.equal(types["https://play.example/a.m3u8"], "hls");
  assert.equal(types["https://play.example/b.mpd"], "dash");
  assert.equal(types["https://play.example/c.mp4"], "mp4");
  assert.equal(types["https://play.example/d"], "unknown");
});

test("DASH manifests normalize as adaptive playback candidates", () => {
  const [candidate] = normalizeVariants(
    [{ url: "https://media.example/title/manifest.mpd" }],
    "va",
  );
  assert.equal(candidate.type, "dash");
  assert.equal(candidate.declaredType, "dash");
  assert.ok(candidate.score >= 300);
});

test("anything that is not a web address is dropped", () => {
  const candidates = normalizeVariants(
    [
      { url: "javascript:alert(1)" },
      { url: "file:///etc/passwd" },
      { url: "not a url at all" },
      { url: null },
      { url: "https://play.example/ok.m3u8" },
    ],
    "va",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, "https://play.example/ok.m3u8");
});

test("the same address is only offered once", () => {
  const candidates = normalizeVariants(
    [
      { url: "https://play.example/a.m3u8", quality: "1080p" },
      { url: "https://play.example/a.m3u8", quality: "720p" },
    ],
    "va",
  );
  assert.equal(candidates.length, 1);
});

test("candidate ids are unique within one answer", () => {
  const candidates = normalizeVariants(
    [
      { url: "https://play.example/a.m3u8" },
      { url: "https://play.example/b.m3u8" },
      { url: "https://play.example/c.mp4" },
    ],
    "va",
  );
  assert.equal(new Set(candidates.map((c) => c.id)).size, candidates.length);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(normalizeVariants([], "va"), []);
  assert.deepEqual(normalizeVariants(undefined, "va"), []);
});
