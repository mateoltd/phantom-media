import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePoll, parsePollEvent, pollAt, pollShares, readPoll, recordPoll } from '../lib/chat/polls.ts';
import { createPollSession } from '../lib/chat/poll-session.ts';
import { fetchChannelPoll } from '../lib/twitch/polls.ts';

const started = Date.parse('2026-10-11T00:05:51.044Z');
const votes = total => ({ total, bits: 0, channel_points: 0, base: total, granted: 0 });
// Shaped like a message captured from the `polls.<channel>` topic.
const event = (type = 'POLL_UPDATE', changes = {}) => JSON.stringify({ type, data: { poll: {
  poll_id: '996e9607-e90a-47f5-9662-1c7426d1f85c', owned_by: '163562674', title: 'WHAT GAME NEXT',
  started_at: '2026-10-11T00:05:51.044427812Z', ended_at: null, duration_seconds: 600, status: 'ACTIVE',
  choices: [
    { choice_id: 'a6e9b8b2-938a-48b5-9761-67ffdcb68752', title: 'TEXAS/OU SOONERS', votes: votes(57), total_voters: 57 },
    { choice_id: '3f389ff0-e33d-4ebc-9a3d-de7ce30f0a15', title: 'SOUTH CAROLINA/FLORIDA', votes: votes(7), total_voters: 7 },
    { choice_id: '742405ab-0f30-4e57-a998-d59a6b33f764', title: 'TENNESSEE/ARKANSAS', votes: votes(1), total_voters: 1 },
    { choice_id: '9da6655a-fc18-4e4c-bb5f-4bbb8fa46606', title: 'UCLA/OREGON', votes: votes(7), total_voters: 7 },
  ],
  votes: votes(72), total_voters: 72, remaining_duration_milliseconds: 147317, ...changes,
} } });
const graph = (changes = {}) => ({
  id: '996e9607-e90a-47f5-9662-1c7426d1f85c', title: 'WHAT GAME NEXT', status: 'ACTIVE',
  startedAt: '2026-10-11T00:05:51.044427812Z', endedAt: null, durationSeconds: 600,
  choices: [{ id: 'a6e9b8b2', title: 'TEXAS/OU SOONERS', votes: { total: 56 } }, { id: '3f389ff0', title: 'UCLA/OREGON', votes: { total: 15 } }],
  ...changes,
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('PubSub and GraphQL polls normalize to the same shape', () => {
  const live = parsePollEvent(event());
  assert.equal(live.title, 'WHAT GAME NEXT');
  assert.equal(live.status, 'active');
  assert.equal(live.startedAt, started);
  assert.equal(live.endsAt, started + 600_000);
  assert.equal(live.votes, 72);
  assert.deepEqual(live.choices.map(choice => choice.votes), [57, 7, 1, 7]);
  const queried = normalizePoll(graph());
  assert.deepEqual({ ...queried, choices: queried.choices.length, votes: queried.votes },
    { ...live, choices: 2, votes: 71 });
  assert.deepEqual(readPoll(JSON.parse(JSON.stringify(queried))), queried);
});

test('a closed poll keeps its real end and an archived one is retired', () => {
  const ended = parsePollEvent(event('POLL_COMPLETE', { status: 'COMPLETED', ended_at: '2026-10-11T00:15:51.100Z' }));
  assert.equal(ended.status, 'ended');
  assert.equal(ended.endsAt, Date.parse('2026-10-11T00:15:51.100Z'));
  assert.equal(parsePollEvent(event('POLL_TERMINATE', { status: 'TERMINATED', ended_at: '2026-10-11T00:07:00Z' })).endsAt, Date.parse('2026-10-11T00:07:00Z'));
  assert.equal(parsePollEvent(event('POLL_ARCHIVE', { status: 'COMPLETED' })).status, 'archived');
  assert.equal(normalizePoll(graph({ status: 'MODERATED' })).status, 'archived');
});

test('malformed polls are rejected', () => {
  assert.equal(parsePollEvent('{'), null);
  assert.equal(parsePollEvent(JSON.stringify({ type: 'viewcount', viewers: 3 })), null);
  assert.equal(parsePollEvent(event('POLL_UPDATE', { poll_id: '../x' })), null);
  assert.equal(parsePollEvent(event('POLL_UPDATE', { started_at: 'soon' })), null);
  assert.equal(parsePollEvent(event('POLL_UPDATE', { choices: [{ choice_id: 'a', title: 'Only one', votes: votes(1) }] })), null);
  assert.equal(normalizePoll(graph({ durationSeconds: 1e9 })), null);
  assert.equal(readPoll({ ...normalizePoll(graph()), status: 'archived' }), null);
  const odd = parsePollEvent(event('POLL_UPDATE', { title: 'Line\u0000 one\n', choices: [
    { choice_id: 'a', title: 'A', votes: { total: -4 } }, { choice_id: 'b', title: 'B', votes: { total: 2.9 } }, { choice_id: 'c', title: 'C' },
  ] }));
  assert.equal(odd.title, 'Line one');
  assert.deepEqual(odd.choices.map(choice => choice.votes), [0, 2, 0]);
});

test('shares are whole and add up to 100', () => {
  const poll = votes => ({ votes: votes.reduce((sum, value) => sum + value, 0), choices: votes.map(value => ({ votes: value })) });
  assert.deepEqual(pollShares(poll([1, 1, 1])), [34, 33, 33]);
  assert.deepEqual(pollShares(poll([57, 7, 1, 7])), [79, 10, 1, 10]);
  assert.deepEqual(pollShares(poll([0, 0])), [0, 0]);
});

test('the timeline answers what was on screen at any moment', () => {
  const first = parsePollEvent(event());
  const later = { ...first, votes: 80 };
  const closed = { ...first, votes: 81, status: 'ended', endsAt: started + 600_100 };
  let history = recordPoll([], first, started + 440_000);
  history = recordPoll(history, later, started + 500_000);
  assert.equal(pollAt(history, started - 1), null);
  // Already running when first seen: the earliest report stands in for the unseen start.
  assert.equal(pollAt(history, started + 10_000).votes, 72);
  assert.equal(pollAt(history, started + 499_999).votes, 72);
  assert.equal(pollAt(history, started + 500_000).votes, 80);
  // The scheduled close passes without a closing message.
  assert.equal(pollAt(history, started + 599_999).status, 'active');
  assert.equal(pollAt(history, started + 600_000).status, 'ended');
  assert.equal(pollAt(history, started + 660_001), null);
  history = recordPoll(history, closed, started + 600_100);
  assert.equal(pollAt(history, started + 660_050).votes, 81);
  assert.equal(pollAt(history, started + 660_101), null);
  history = recordPoll(history, { ...closed, status: 'archived' }, started + 620_000);
  assert.equal(pollAt(history, started + 619_999).status, 'ended');
  assert.equal(pollAt(history, started + 620_000), null);
  // Seeking back replays the earlier state.
  assert.equal(pollAt(history, started + 450_000).votes, 72);
  const next = { ...first, id: 'next', title: 'Second poll', startedAt: started + 900_000, endsAt: started + 960_000 };
  history = recordPoll(history, next, started + 900_000);
  assert.equal(pollAt(history, started + 899_999), null);
  assert.equal(pollAt(history, started + 900_000).title, 'Second poll');
  assert.equal(recordPoll(history, next, 0).at(-1).at, started + 900_000);
});

test('server poll query validates the channel and shares one upstream read', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests++;
    const request = JSON.parse(options.body);
    assert.match(request.query, /query ChatPoll/);
    assert.equal(request.variables.login, 'jankyrondo');
    return Response.json({ data: { user: { id: '163562674', viewablePoll: graph() } } });
  });
  const [first, second] = await Promise.all([fetchChannelPoll('JankyRondo'), fetchChannelPoll('jankyrondo')]);
  assert.equal(first.channelId, '163562674');
  assert.equal(first.poll.votes, 71);
  assert.deepEqual(second, first);
  assert.equal(requests, 1);
  assert.throws(() => fetchChannelPoll('../jankyrondo'));
});

test('server poll query reports no poll, and a missing channel', async t => {
  const replies = [{ data: { user: { id: '1', viewablePoll: null } } }, { data: { user: { id: '2', viewablePoll: graph({ status: 'ARCHIVED' }) } } }, { data: { user: null } }];
  t.mock.method(globalThis, 'fetch', async () => Response.json(replies.shift()));
  assert.deepEqual(await fetchChannelPoll('quiet_channel'), { channelId: '1', poll: null });
  assert.deepEqual(await fetchChannelPoll('retired_poll'), { channelId: '2', poll: null });
  await assert.rejects(fetchChannelPoll('missing_channel'), { kind: 'not-found' });
});

function sessionHarness(t, replies) {
  const sockets = [];
  const states = [];
  const requests = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: started + 440_000 });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, signal: options.signal });
    const reply = replies.shift();
    assert.ok(reply, 'unexpected fetch');
    return reply;
  });
  t.mock.property(globalThis, 'WebSocket', class {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.closed = true; }
  });
  const stop = createPollSession({ channel: 'JankyRondo', onChange: state => states.push(state) });
  t.after(stop);
  const stamp = () => new Date(Date.now()).toISOString();
  return {
    sockets, states, requests, stop,
    welcome: (socket = sockets.at(-1)) => socket.onmessage({ data: JSON.stringify({ type: 'welcome', welcome: { keepaliveSec: 15 }, timestamp: stamp() }) }),
    notify: (pubsub, socket = sockets.at(-1)) => socket.onmessage({ data: JSON.stringify({ type: 'notification', notification: { type: 'pubsub', pubsub }, timestamp: stamp() }) }),
  };
}
const answer = poll => Response.json({ channelId: '163562674', poll: poll ? normalizePoll(poll) : null });

test('a session starts from the poll in progress, then follows the socket', async t => {
  const h = sessionHarness(t, [answer(graph())]);
  await tick(); await tick();
  assert.match(h.requests[0].url, /\/api\/chat\/poll\?channel=jankyrondo$/);
  assert.equal(h.states.at(-1).history.at(-1).poll.votes, 71);
  assert.match(h.sockets[0].url, /^wss:\/\/hermes\.twitch\.tv\/v1\?clientId=/);
  h.welcome();
  assert.equal(h.sockets[0].sent[0].subscribe.pubsub.topic, 'polls.163562674');
  t.mock.timers.tick(20_000);
  h.notify(event());
  h.notify(JSON.stringify({ type: 'viewcount' }));
  h.notify('{');
  const { history } = h.states.at(-1);
  assert.deepEqual(history.map(snapshot => snapshot.poll.votes), [71, 72]);
  assert.equal(history.at(-1).at, started + 460_000);
  h.stop();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.sockets[0].closed, true);
});

test('a dropped socket reconnects from a fresh snapshot and retires a poll it missed the end of', async t => {
  const h = sessionHarness(t, [answer(graph()), answer(null)]);
  await tick(); await tick();
  h.welcome();
  h.sockets[0].onclose();
  assert.equal(h.sockets.length, 1);
  t.mock.timers.tick(30_000);
  await tick(); await tick();
  assert.equal(h.sockets.length, 2);
  assert.equal(h.states.at(-1).history.at(-1).poll.status, 'archived');
  // The replaced socket can no longer write to the timeline.
  h.notify(event(), h.sockets[0]);
  assert.equal(h.states.at(-1).history.length, 2);
});

test('silence past the keepalive replaces the socket', async t => {
  const h = sessionHarness(t, [answer(null), answer(null)]);
  await tick(); await tick();
  h.welcome();
  t.mock.timers.tick(34_000);
  assert.equal(h.sockets[0].closed, false);
  t.mock.timers.tick(1_000);
  assert.equal(h.sockets[0].closed, true);
  t.mock.timers.tick(1_000);
  await tick(); await tick();
  assert.equal(h.sockets.length, 2);
});

test('a channel that cannot be read is left alone', async t => {
  const gone = sessionHarness(t, [new Response(null, { status: 404 })]);
  await tick(); await tick();
  t.mock.timers.tick(120_000);
  await tick();
  assert.equal(gone.requests.length, 1);
  assert.equal(gone.sockets.length, 0);
});

test('a failed snapshot is retried before any socket opens', async t => {
  const h = sessionHarness(t, [new Response(null, { status: 502 }), answer(null)]);
  await tick(); await tick();
  assert.equal(h.sockets.length, 0);
  t.mock.timers.tick(1_000);
  await tick(); await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.sockets.length, 1);
});
