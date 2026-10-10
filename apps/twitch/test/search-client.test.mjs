import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { prepareSearchAvatar, searchAvatarReady, searchAvatarURL } from "../lib/search/avatars.ts";
import { localChannelSearch, refreshChannelSearch, subscribeSearch, warmSearch } from "../lib/search/client.ts";
for (const name of ["Image", "window", "localStorage"]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: undefined });
afterEach(() => mock.restoreAll());

class ControlledImage {
  static instances = [];
  constructor() { ControlledImage.instances.push(this); }
  decode() { return Promise.resolve(); }
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const image = name => `https://static-cdn.jtvnw.net/jtv_user_pictures/${name}-150x150.png`;
const row = (login, extras = {}) => ({ login, displayName: login, isLive: false, observedAt: Date.now(), ...extras });
const response = results => Response.json({ results, matchedLogins: results.map(row => row.login), missing: [], checkedAt: Date.now() });

test("avatars are decoded before readiness; alternate Twitch sizes share one source", async () => {
  mock.property(globalThis, "Image", ControlledImage);
  const url = image("decodedfixture");
  const loading = prepareSearchAvatar(url);
  const same = prepareSearchAvatar(url.replace("150x150", "50x50"));
  await flush();
  assert.equal(searchAvatarReady(url), false);
  assert.equal(ControlledImage.instances.length, 1);
  const pending = ControlledImage.instances[0];
  assert.match(pending.src, /50x50/);
  pending.onload();
  await Promise.all([loading, same]);
  assert.equal(searchAvatarReady(url), true);
  assert.equal(searchAvatarURL(url), pending.src);
});

test("a failed avatar is a settled fallback, not a permanently incomplete row", async () => {
  mock.property(globalThis, "Image", ControlledImage);
  const url = image("failedfixture");
  const loading = prepareSearchAvatar(url); await flush();
  ControlledImage.instances.at(-1).onerror(); await loading;
  assert.equal(searchAvatarReady(url), true);
  assert.equal(searchAvatarURL(url), undefined);
});

test("new channel names and states become visible with their decoded avatar", async () => {
  mock.property(globalThis, "Image", ControlledImage);
  const url = image("readinessfixture");
  const fetch = mock.method(globalThis, "fetch", async url => {
    assert.match(String(url), /\/search\/suggestions\?q=/);
    return response([row("readinessfixture", { profileImageURL: image("readinessfixture") })]);
  });
  const loading = refreshChannelSearch("readinessfixture", new AbortController().signal);
  await flush();
  assert.deepEqual(localChannelSearch("readinessfixture"), []);
  const pending = ControlledImage.instances.find(instance => instance.src.includes("readinessfixture"));
  assert.ok(pending); pending.onload(); await loading;
  const match = localChannelSearch("readinessfixture")[0];
  assert.equal(match.login, "readinessfixture"); assert.equal(match.isLive, false);
  assert.equal(searchAvatarURL(match.profileImageURL), url.replace("150x150", "50x50"));
  await refreshChannelSearch("readinessfixture", new AbortController().signal);
  assert.equal(fetch.mock.callCount(), 1, "a repeated query uses complete cached rows");
});

test("late autocomplete preserves the expanded query pool and does not leak semantic matches", async () => {
  let release;
  mock.method(globalThis, "fetch", async url => String(url).includes("/suggestions?")
    ? new Promise(resolve => { release = () => resolve(response([row("semanticfirst")])); })
    : response([row("semanticfirst"), row("semanticsecond")]));
  const quick = refreshChannelSearch("poolwordfixture", new AbortController().signal);
  await flush();
  await refreshChannelSearch("poolwordfixture", new AbortController().signal, true);
  release(); await quick;
  assert.equal(localChannelSearch("poolwordfixture").length, 2);
  assert.deepEqual(localChannelSearch("unrelatedwordfixture"), []);
});

test("page warming supplies complete identities without a query lookup and expired states stay hidden", async () => {
  mock.property(globalThis, "window", { addEventListener() {} });
  mock.property(globalThis, "localStorage", { getItem: () => null, setItem() {} });
  const sampledAt = Date.now();
  const fetch = mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "/api/channel/search/index");
    return Response.json({ channels: [row("warmingfixture", { observedAt: sampledAt })] });
  });
  await warmSearch();
  assert.equal(localChannelSearch("warmingfixture")[0].isLive, false);
  assert.equal(fetch.mock.callCount(), 1);
  mock.method(Date, "now", () => sampledAt + 120_001);
  assert.deepEqual(localChannelSearch("warmingfixture"), []);
  assert.deepEqual(localChannelSearch("rubius"), [], "a roster hint is not a completed suggestion");
});


test("cached semantic reads preserve original deadlines and each source expires independently", async () => {
  let now = Date.now();
  mock.method(Date, "now", () => now);
  const fetch = mock.method(globalThis, "fetch", async url => response([row(String(url).includes("/suggestions?") ? "expiryquickfixture" : "expiryexpandedfixture")]));
  await refreshChannelSearch("expirywordfixture", new AbortController().signal);
  now += 20_000;
  await refreshChannelSearch("expirywordfixture", new AbortController().signal, true);
  now += 9_000;
  await refreshChannelSearch("expirywordfixture", new AbortController().signal);
  assert.equal(fetch.mock.callCount(), 2);
  now += 1_001;
  assert.deepEqual(localChannelSearch("expirywordfixture").map(row => row.login), ["expiryexpandedfixture"]);
  now += 20_000;
  assert.deepEqual(localChannelSearch("expirywordfixture"), []);
});

test("avatar saturation settles all rows within the total deadline, including queue wait", async () => {
  mock.property(globalThis, "Image", ControlledImage);
  const urls = Array.from({ length: 78 }, (_, i) => image(`saturatedfixture${i}`));
  const started = performance.now();
  // Keep Node's event loop alive while browser-style AbortSignal timers run.
  const keepAlive = setTimeout(() => {}, 1500);
  try {
    await Promise.all(urls.map(prepareSearchAvatar));
    assert.ok(performance.now() - started < 1000, "queue waits cannot multiply the 250ms deadline");
    assert.ok(urls.every(searchAvatarReady));
    assert.ok(urls.every(url => searchAvatarURL(url) === undefined));
  } finally { clearTimeout(keepAlive); }
});


test("the first complete row is published without waiting for a slower sibling avatar", async () => {
  mock.property(globalThis, "Image", ControlledImage);
  mock.method(globalThis, "fetch", async () => response([
    row("batchfixtureone", { profileImageURL: image("batchfixtureone") }),
    row("batchfixturetwo", { profileImageURL: image("batchfixturetwo") }),
  ]));
  const published = [];
  const unsubscribe = subscribeSearch(() => published.push(localChannelSearch("batchfixture").map(row => row.login)));
  try {
    const loading = refreshChannelSearch("batchfixture", new AbortController().signal);
    await flush();
    ControlledImage.instances.find(image => image.src.includes("batchfixtureone")).onload();
    await flush();
    assert.ok(published.some(rows => rows.length === 1 && rows[0] === "batchfixtureone"));
    assert.equal(searchAvatarReady(image("batchfixturetwo")), false);
    ControlledImage.instances.find(image => image.src.includes("batchfixturetwo")).onload();
    await loading;
    assert.equal(localChannelSearch("batchfixture").length, 2);
  } finally { unsubscribe(); }
});
