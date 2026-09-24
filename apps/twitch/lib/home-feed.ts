/** Keep discovery visible even when a viewer has a long watch history. */
export function homeSlots(historyCount: number) {
  const history = Math.min(3, Math.max(0, historyCount));
  return { history, recommendations: 6 - history };
}

export function channelRail<T extends { login: string }>(recent: T[], suggested: T[], capacity = 8) {
  const watched = recent.slice(0, Math.max(0, capacity - 2));
  const seen = new Set(recent.map((channel) => channel.login.toLowerCase()));
  const recommendations = suggested.filter((channel) => {
    const key = channel.login.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, capacity - watched.length);
  return [...watched.map((channel) => ({ channel, suggested: false })), ...recommendations.map((channel) => ({ channel, suggested: true }))];
}

/** An old video from a currently-live channel must still open as a video. */
export function isCurrentBroadcast(entry: { vodId: string }, channel?: { stream?: { archiveVideo?: { id: string } | null } | null }) {
  return Boolean(channel?.stream?.archiveVideo?.id && channel.stream.archiveVideo.id === entry.vodId);
}

export function uniqueChannels<T extends { login: string }>(channels: T[]) {
  const seen = new Set<string>();
  return channels.filter((channel) => {
    const key = channel.login.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function watchFeed<H, C>(history: H[], channels: C[]) {
  const feed: ({ kind: "history"; entry: H } | { kind: "channel"; channel: C })[] = [];
  for (let index = 0; index < Math.max(history.length, channels.length); index += 3) {
    feed.push(...history.slice(index, index + 3).map((entry) => ({ kind: "history" as const, entry })));
    feed.push(...channels.slice(index, index + 3).map((channel) => ({ kind: "channel" as const, channel })));
  }
  return feed;
}
