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
  RETIRED_SOURCE_IDS,
  SOURCE_IDS,
  SOURCE_ROSTER,
  sourceAlias,
} from "../src/source-ids.mjs";

test("every catalogued source has something that can answer for it", () => {
  // The registry throws at import if this is not true, so reaching here is
  // most of the assertion; this names the failure if it ever changes.
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
  // "Source 07" has to mean the same thing between sessions, so ids may only
  // ever be appended. Inserting one renumbers everything after it.
  //
  // Retiring must not renumber either, which is why the number comes from the
  // full roster rather than from the catalog: a source's alias is where its
  // code sits in `SOURCE_IDS`, not where it sits in what is left.
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
    SOURCE_IDS.length - RETIRED_SOURCE_IDS.size,
  );
  for (const id of RETIRED_SOURCE_IDS) {
    // Still a known code — that is what keeps the numbering still — but it
    // has no descriptor, so nothing can resolve through it.
    assert.ok(SOURCE_IDS.includes(id), `${id} left the roster`);
    assert.equal(providerDescriptor(id), null);
    assert.equal(getProvider(id), null);
    assert.ok(!SOURCE_ROSTER.some((entry) => entry.id === id));
    assert.ok(!ACTIVE_SOURCE_IDS.includes(id));
  }
});

test("catalogued ids are unique", () => {
  assert.equal(new Set(PROVIDER_CATALOG.map((d) => d.id)).size, PROVIDER_CATALOG.length);
});

test("no third party's name survives normalisation", () => {
  // The rule is that no upstream brand reaches a response body, a screen or a
  // log line. Making that a test rather than a habit is the only way it
  // survives the next provider someone adds.
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
    "s7",
  );

  assert.equal(candidate.server, "s7");
  assert.equal(candidate.serverLabel, "Source 10");
  assert.equal(candidate.provider, "s7");
  assert.equal(candidate.providerLabel, "Source 10");
  // Scoring is not something a source gets to claim about itself either.
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
