/** Missing live state means unobserved, never offline. */
export interface SearchChannel {
  login: string;
  displayName: string;
  profileImageURL?: string;
  isLive?: boolean;
  viewersCount?: number;
  title?: string;
  gameName?: string;
  observedAt?: number;
  followerCount?: number;
  isPartner?: boolean;
  isVerified?: boolean;
  verifiedObservedAt?: number;
  popularityObservedAt?: number;
}
export interface SearchVisit { channel: string; timestamp: number }

export interface SearchIdentity {
  login: string; displayName: string; profileImageURL?: string;
  followers?: { totalCount?: number | null } | null;
  roles?: { isPartner?: boolean | null } | null;
  stream?: { title: string; viewersCount: number; game?: { name: string } | null } | null;
}
export function observedChannel(channel: SearchIdentity, now = Date.now()): SearchChannel {
  const followers = channel.followers?.totalCount;
  const followerCount = typeof followers === "number" && Number.isSafeInteger(followers) && followers >= 0 ? followers : undefined;
  const isPartner = typeof channel.roles?.isPartner === "boolean" ? channel.roles.isPartner : undefined;
  return { login: channel.login, displayName: channel.displayName, profileImageURL: channel.profileImageURL,
    isLive: channel.stream === undefined ? undefined : Boolean(channel.stream), title: channel.stream?.title,
    gameName: channel.stream?.game?.name, viewersCount: channel.stream?.viewersCount, observedAt: channel.stream === undefined ? undefined : now,
    ...(followerCount !== undefined || isPartner !== undefined ? { followerCount, isPartner, popularityObservedAt: now } : {}) };
}

/** Bound both public API and local-storage input before indexing it. */
export function readSearchChannels(value: unknown): SearchChannel[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000).flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.login !== "string" || !/^[a-z0-9_]{3,25}$/i.test(item.login)
      || typeof item.displayName !== "string" || item.displayName.length > 100) return [];
    const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value : undefined;
    return [{ login: item.login.toLowerCase(), displayName: item.displayName,
      profileImageURL: typeof item.profileImageURL === "string" && /^https:\/\//.test(item.profileImageURL) ? text(item.profileImageURL, 2048) : undefined,
      isLive: typeof item.isLive === "boolean" ? item.isLive : undefined,
      isVerified: typeof item.isVerified === "boolean" ? item.isVerified : undefined,
      verifiedObservedAt: Number.isFinite(item.verifiedObservedAt) && item.verifiedObservedAt > 0 ? Math.min(Date.now(), item.verifiedObservedAt) : undefined,
      viewersCount: Number.isFinite(item.viewersCount) && item.viewersCount >= 0 ? item.viewersCount : undefined,
      observedAt: Number.isFinite(item.observedAt) && item.observedAt > 0 ? Math.min(Date.now(), item.observedAt) : undefined,
      followerCount: Number.isSafeInteger(item.followerCount) && item.followerCount >= 0 ? item.followerCount : undefined,
      isPartner: typeof item.isPartner === "boolean" ? item.isPartner : undefined,
      popularityObservedAt: Number.isFinite(item.popularityObservedAt) && item.popularityObservedAt > 0 ? Math.min(Date.now(), item.popularityObservedAt) : undefined,
      title: text(item.title, 500), gameName: text(item.gameName, 100) }];
  });
}
