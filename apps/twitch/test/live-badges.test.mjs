import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChatLine } from '../lib/chat/messages.ts';
import { normalizeBadgeCatalog, resolveMessageBadges } from '../lib/chat/badges.ts';
import { createLiveChatSession } from '../lib/chat/irc.ts';
import { fetchChatBadges } from '../lib/twitch/badges.ts';

const image = 'https://static-cdn.jtvnw.net/badges/v1/cb874239-c790-4f58-93c2-319254d61d18/1';
const definition = (setID, version, title) => ({ setID, version, title, imageURL: image });
const line = '@id=badge-message;badges=subscriber/12,moderator/1,unknown/2;display-name=Viewer;color=#ffffff :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #rubius :Hello';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('live badge identities resolve by version with channel overrides and safe artwork', () => {
  const parsed = parseChatLine(line);
  assert.deepEqual(parsed.badges.map(({ id, version }) => `${id}/${version}`), ['subscriber/12', 'moderator/1', 'unknown/2']);
  const entries = normalizeBadgeCatalog([
    definition('subscriber', '12', 'Global subscriber'), definition('moderator', '1', 'Moderator'),
    { ...definition('unsafe', '1', 'Unsafe'), imageURL: 'https://example.com/badge.png' },
  ], [definition('subscriber', '12', 'Rubius subscriber')]);
  const resolved = resolveMessageBadges(parsed, new Map(entries.map(badge => [`${badge.id}/${badge.version}`, badge])));
  assert.equal(resolved.badges[0].title, 'Rubius subscriber');
  assert.equal(resolved.badges[1].imageUrl, image);
  assert.equal(resolved.badges[2].imageUrl, undefined);
  assert.deepEqual(parseChatLine(line.replace('subscriber/12,moderator/1,unknown/2', 'broken,subscriber/../,moderator/1')).badges.map(b => b.id), ['moderator']);
});

test('prediction and Warcraft badge versions survive parsing, catalog normalization and artwork resolution', () => {
  const definitions = [
    definition('predictions', 'blue-1', 'Predicted Blue (1)'),
    definition('predictions', 'pink-2', 'Predicted Pink (2)'),
    definition('warcraft', 'horde', 'Horde'),
    definition('warcraft', 'alliance', 'Alliance'),
  ];
  const identities = definitions.map(badge => `${badge.setID}/${badge.version}`);
  const parsed = parseChatLine(line.replace('subscriber/12,moderator/1,unknown/2', identities.join(',')));
  assert.deepEqual(parsed.badges.map(badge => `${badge.id}/${badge.version}`), identities);
  const entries = normalizeBadgeCatalog(definitions, []);
  assert.equal(entries.length, definitions.length);
  const resolved = resolveMessageBadges(parsed, new Map(entries.map(badge => [`${badge.id}/${badge.version}`, badge])));
  assert.deepEqual(resolved.badges.map(badge => ({ title: badge.title, imageUrl: badge.imageUrl })),
    definitions.map(badge => ({ title: badge.title, imageUrl: badge.imageURL })));
});

test('badge versions still reject empty, malformed and oversized values', () => {
  for (const version of ['', '../', 'blue/1', 'blue 1', 'x'.repeat(101)]) {
    const ircVersion = version.replaceAll(' ', '\\s');
    const parsed = parseChatLine(line.replace('subscriber/12,moderator/1,unknown/2', `predictions/${ircVersion}`));
    assert.deepEqual(parsed.badges, [], `IRC version ${JSON.stringify(version)}`);
    assert.deepEqual(normalizeBadgeCatalog([definition('predictions', version, 'Invalid')], []), [],
      `Catalog version ${JSON.stringify(version)}`);
  }
});

test('server badge query uses a validated channel and caches normalized artwork', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests++;
    const request = JSON.parse(options.body);
    assert.match(request.query, /query ChatBadges/);
    assert.equal(request.variables.login, 'rubius');
    return Response.json({ data: { badges: [definition('moderator', '1', 'Moderator')], user: { broadcastBadges: [definition('subscriber', '12', 'Rubius subscriber')] } } });
  });
  const entries = await fetchChatBadges('Rubius');
  assert.equal(entries.length, 2);
  assert.deepEqual(await fetchChatBadges('rubius'), entries);
  assert.equal(requests, 1);
  assert.throws(() => fetchChatBadges('../rubius'));
});

function sessionHarness(t, response) {
  let flush;
  let socket;
  let messages = [];
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => { signal = options.signal; return response; });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { setInterval: callback => { flush = callback; return 0; } };
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  t.mock.property(globalThis, 'WebSocket', class {
    constructor() { socket = this; }
    send() {}
    close() {}
  });
  const stop = createLiveChatSession({ channel: 'rubius', updateMessages: update => { messages = update(messages); }, onStatus() {} });
  t.after(stop);
  return { receive: (id = 'badge-message') => socket.onmessage({ data: line.replace('id=badge-message', `id=${id}`) }), flush: () => flush(), messages: () => messages, signal: () => signal, stop };
}

test('late artwork resolves buffered and displayed messages, then new arrivals', async t => {
  let resolve;
  const h = sessionHarness(t, new Promise(done => { resolve = done; }));
  h.receive();
  h.flush();
  assert.equal(h.messages()[0].badges[0].imageUrl, undefined);
  resolve(Response.json([{ id: 'subscriber', version: '12', title: 'Rubius subscriber', imageUrl: image }]));
  await tick();
  assert.equal(h.messages()[0].badges[0].imageUrl, image);
  h.receive('next-message');
  h.flush();
  assert.equal(h.messages()[1].badges[0].imageUrl, image);
  h.stop();
  assert.equal(h.signal().aborted, true);
});

test('artwork arriving before a flush resolves pending messages', async t => {
  const h = sessionHarness(t, Promise.resolve(Response.json([{ id: 'subscriber', version: '12', title: 'Subscriber', imageUrl: image }])));
  h.receive();
  await tick();
  h.flush();
  assert.equal(h.messages()[0].badges[0].imageUrl, image);
});

test('badge failure leaves live messages available', async t => {
  const h = sessionHarness(t, Promise.resolve(new Response(null, { status: 502 })));
  await tick();
  h.receive();
  h.flush();
  assert.equal(h.messages()[0].text, 'Hello');
});

test('stopped sessions ignore late artwork', async t => {
  let resolve;
  const h = sessionHarness(t, new Promise(done => { resolve = done; }));
  h.receive();
  h.flush();
  h.stop();
  resolve(Response.json([{ id: 'subscriber', version: '12', title: 'Subscriber', imageUrl: image }]));
  await tick();
  assert.equal(h.messages()[0].badges[0].imageUrl, undefined);
});
