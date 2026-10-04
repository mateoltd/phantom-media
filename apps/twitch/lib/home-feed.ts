/** Only the archive of the broadcast that is on air right now counts as live. Older videos from a live channel do not. */
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
