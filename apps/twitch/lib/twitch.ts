import { buildDiscoveryProfile, rankDiscovery, type DiscoveryPage, type DiscoveryContinuation, type DiscoveryHistory, type DiscoveryCandidate, type WatchedVideo, type ChannelDiscoveryData, type DiscoveryChannel } from "./discovery.ts";

export interface TwitchVideoData {
  id?: string;
  title?: string;
  broadcastType: string;
  createdAt: string;
  lengthSeconds?: number;
  previewThumbnailURL?: string;
  viewCount?: number;
  seekPreviewsURL: string;
  owner: { login: string };
}

interface TwitchGQLResponse {
  data: {
    video: TwitchVideoData | null;
  };
}

const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_ENDPOINT = "https://gql.twitch.tv/gql";

interface GraphQLError {
  message?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface TwitchChannelVideo {
  id: string;
  title: string;
  createdAt: string;
  lengthSeconds: number;
  viewCount: number;
  broadcastType: string;
  previewThumbnailURL: string;
}

export interface TwitchLiveStream {
  id: string;
  title: string;
  type: string;
  viewersCount: number;
  createdAt: string;
  game?: { name: string } | null;
}

export interface TwitchChannelData {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  stream: TwitchLiveStream | null;
  videos: TwitchChannelVideo[];
}

export interface TwitchSearchResult {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  isLive: boolean;
  title?: string;
  gameName?: string;
  viewersCount?: number;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const resp = await fetch(GQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Client-Id": CLIENT_ID,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error("Twitch API authentication failed - Client-ID may have changed");
        }
        if ((resp.status === 429 || resp.status >= 500) && attempt < 2) {
          await retryDelay(attempt);
          continue;
        }
        throw new Error(`Twitch API error: ${resp.status}`);
      }

      const data: GraphQLResponse<T> = await resp.json();
      if (data.errors?.length) {
        const message = data.errors[0].message || "Twitch API query failed";
        if (isTransientGraphQLError(message) && attempt < 2) {
          await retryDelay(attempt);
          continue;
        }
        throw new Error(message);
      }
      if (!data.data) throw new Error("Twitch API returned no data");
      return data.data;
    } catch (error) {
      const isNetworkFailure = error instanceof TypeError ||
        (error instanceof DOMException && error.name === "TimeoutError");
      if (isNetworkFailure && attempt < 2) {
        await retryDelay(attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Twitch API is temporarily unavailable");
}

function isTransientGraphQLError(message: string): boolean {
  return /service error|internal server error|temporar|timeout|upstream|unavailable|rate limit/i.test(message);
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 100));
}

export async function fetchVodMetadata(vodId: string): Promise<TwitchVideoData> {
  const data = await gql<TwitchGQLResponse["data"]>(
    `query VideoMetadata($id: ID!) {
      video(id: $id) {
        id
        title
        broadcastType
        createdAt
        lengthSeconds
        previewThumbnailURL(width: 1280, height: 720)
        viewCount
        seekPreviewsURL
        owner { login }
      }
    }`,
    { id: vodId }
  );

  if (!data.video) {
    throw new Error("VOD not found");
  }

  return data.video;
}

export async function fetchChannel(login: string): Promise<TwitchChannelData> {
  const data = await gql<{
    user: (Omit<TwitchChannelData, "videos"> & {
      videos: { edges: { node: TwitchChannelVideo }[] } | null;
    }) | null;
  }>(
    `query ChannelSurface($login: String!) {
      user(login: $login) {
        id
        login
        displayName
        description
        profileImageURL(width: 300)
        stream {
          id
          title
          type
          viewersCount
          createdAt
          game { name }
        }
        videos(first: 18, sort: TIME) {
          edges {
            node {
              id
              title
              createdAt
              lengthSeconds
              viewCount
              broadcastType
              previewThumbnailURL(width: 640, height: 360)
            }
          }
        }
      }
    }`,
    { login }
  );

  if (!data.user) {
    throw new Error("Channel not found");
  }

  return {
    ...data.user,
    videos: data.user.videos?.edges.map((edge) => edge.node) ?? [],
  };
}

export async function searchChannels(query: string): Promise<TwitchSearchResult[]> {
  const data = await gql<{
    searchFor: {
      channels: {
        edges: {
          item: TwitchSearchResult & {
            stream?: TwitchLiveStream | null;
          };
        }[];
      };
    } | null;
  }>(
    `query ChannelSearch($query: String!) {
      searchFor(userQuery: $query, platform: "web") {
        channels {
          edges {
            item {
              ... on User {
                id
                login
                displayName
                description
                profileImageURL(width: 150)
                stream {
                  id
                  title
                  viewersCount
                  game { name }
                }
              }
            }
          }
        }
      }
    }`,
    { query }
  );

  return (
    data.searchFor?.channels.edges.map(({ item }) => ({
      id: item.id,
      login: item.login,
      displayName: item.displayName,
      description: item.description,
      profileImageURL: item.profileImageURL,
      isLive: Boolean(item.stream),
      title: item.stream?.title,
      gameName: item.stream?.game?.name,
      viewersCount: item.stream?.viewersCount,
    })) ?? []
  );
}

const DISCOVERY_CHANNEL_FIELDS = `
  id login displayName profileImageURL(width: 150)
  broadcastSettings { language game { name boxArtURL(width: 192, height: 256) } }
  stream {
    title viewersCount broadcastLanguage previewImageURL(width: 640, height: 360)
    archiveVideo { id }
    game { name boxArtURL(width: 192, height: 256) }
  }
`;

interface PersonalSection {
  type: string;
  items: { user?: DiscoveryChannel | null }[];
}
interface DiscoveryConnection { edges: { cursor?: string; node: { broadcaster?: DiscoveryChannel | null } }[]; pageInfo?: { hasNextPage: boolean } }
const connectionChannels = (connection?: DiscoveryConnection | null) =>
  connection?.edges.flatMap(({ node }) => node.broadcaster ? [node.broadcaster] : []) ?? [];

export class DiscoveryUpstreamError extends Error {
  status: 429 | 502 | 403;
  retryAfter: number;
  constructor(status: 429 | 502 | 403, retryAfter: number) {
    super(status === 403 ? "No further public discovery is available. Refresh to discover current channels." : status === 429 ? "Twitch discovery is cooling down" : "Twitch discovery is temporarily unavailable");
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
let discoveryCooldownUntil = 0;

/** Discovery makes one attempt per lookup. Scrolling must never fan out retries. */
async function discoveryRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (discoveryCooldownUntil > Date.now()) throw new DiscoveryUpstreamError(429, Math.ceil((discoveryCooldownUntil - Date.now()) / 1000));
  try {
    const response = await fetch(GQL_ENDPOINT, {
      method: "POST", headers: { "Client-Id": CLIENT_ID, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }), cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    const payload: GraphQLResponse<T> | undefined = response.ok ? await response.json() : undefined;
    if (response.status === 429 || payload?.errors?.some(({ message }) => /rate.?limit|too many requests/i.test(message ?? ""))) {
      const value = response.headers.get("Retry-After");
      const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : 60;
      const retryAfter = Math.min(300, Math.max(30, Number.isFinite(seconds) ? Math.ceil(seconds) : 60));
      discoveryCooldownUntil = Date.now() + retryAfter * 1000;
      throw new DiscoveryUpstreamError(429, retryAfter);
    }
    if (payload?.errors?.some(({ message }) => /integrity check/i.test(message ?? ""))) throw new DiscoveryUpstreamError(403, 0);
    if (!response.ok || payload?.errors?.length || !payload?.data) throw new DiscoveryUpstreamError(502, 15);
    return payload.data;
  } catch (error) {
    if (error instanceof DiscoveryUpstreamError) throw error;
    throw new DiscoveryUpstreamError(502, 15);
  }
}

const discoveryRequests = new Map<string, { expires: number; result: Promise<unknown> }>();
/** Short, bounded cache coalesces identical public Twitch lookups across tabs. */
function discoveryGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const key = JSON.stringify([query, variables]);
  const cached = discoveryRequests.get(key);
  if (cached && cached.expires > Date.now()) return cached.result as Promise<T>;
  if (discoveryRequests.size >= 96) discoveryRequests.delete(discoveryRequests.keys().next().value!);
  const result = discoveryRequest<T>(query, variables).catch((error) => { discoveryRequests.delete(key); throw error; });
  discoveryRequests.set(key, { expires: Date.now() + 60_000, result });
  return result;
}

const DIRECTORY_QUERY = `query DiscoveryDirectory($languages: [Language!], $after: Cursor) {
  streams(first: 30, after: $after, options: { languages: $languages, sort: VIEWER_COUNT }) {
    edges { cursor node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } }
    pageInfo { hasNextPage }
  }
}`;
function directoryPage(languages: string[], after: string | null = null) {
  return discoveryGql<{ streams?: DiscoveryConnection }>(DIRECTORY_QUERY, {
    languages: languages.length ? languages.map((language) => language.toUpperCase()) : null, after,
  });
}
function directoryNext(connection: DiscoveryConnection | undefined, languages: string[], previous?: string): DiscoveryContinuation | undefined {
  const cursor = connection?.edges.at(-1)?.cursor;
  return connection?.pageInfo?.hasNextPage && cursor && cursor !== previous
    ? { cursor, languages: languages.map((language) => language.toUpperCase()) } : undefined;
}
interface DiscoveryPlan { games: string[]; languages: string[]; expires: number; next?: DiscoveryContinuation }
const discoveryPlans = new Map<string, DiscoveryPlan>();
function createDiscoveryPlan(games: string[], languages: string[]): DiscoveryContinuation | undefined {
  if (!games.length) return undefined;
  if (discoveryPlans.size >= 96) discoveryPlans.delete(discoveryPlans.keys().next().value!);
  const cursor = `plan_${crypto.randomUUID()}`;
  const normalized = languages.map((language) => language.toUpperCase());
  discoveryPlans.set(cursor, { games, languages: normalized, expires: Date.now() + 10 * 60_000 });
  return { cursor, languages: normalized };
}
async function expandDiscovery(cursor: string, languages: string[]): Promise<DiscoveryPage> {
  const plan = discoveryPlans.get(cursor);
  if (!plan || plan.expires < Date.now() || JSON.stringify(plan.languages) !== JSON.stringify(languages.map((language) => language.toUpperCase()))) {
    throw new DiscoveryUpstreamError(403, 0);
  }
  const game = plan.games[0];
  const data = await discoveryGql<{ game?: { streams?: DiscoveryConnection } }>(`query DiscoveryExpansionCategory($game: String!, $languages: [String!]) {
    game(name: $game) { streams(first: 30, options: { languages: $languages, sort: VIEWER_COUNT }) {
      edges { node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } }
    } }
  }`, { game, languages: plan.languages.length ? plan.languages.map((language) => language.toLowerCase()) : null });
  const channels = [...new Map(connectionChannels(data.game?.streams).filter((channel) => channel.stream).map((channel) => [channel.login.toLowerCase(), {
    ...channel, recommendation: { source: "category", reason: `${game}, from channels in your recent viewing` },
  }])).values()];
  plan.next ??= createDiscoveryPlan(plan.games.slice(1), plan.languages);
  return { channels, ...(plan.next ? { next: plan.next } : {}) };
}

export async function fetchMoreChannelDiscovery(cursor: string, languages: string[]): Promise<DiscoveryPage> {
  if (cursor.startsWith("plan_")) return expandDiscovery(cursor, languages);
  const data = await directoryPage(languages, cursor);
  if (!data.streams) throw new DiscoveryUpstreamError(502, 15);
  const channels = [...new Map(connectionChannels(data.streams).filter((channel) => channel.stream).map((channel) => [channel.login.toLowerCase(), {
    ...channel, recommendation: { source: "directory", reason: languages.length
      ? `Discover more ${languages.map((language) => new Intl.DisplayNames(["en"], { type: "language" }).of(language.toLowerCase()) ?? language).join(", ")} streams`
      : "Discover more live channels on Twitch" },
  }])).values()];
  const next = directoryNext(data.streams, languages, cursor);
  return { channels, ...(next ? { next } : {}) };
}

export async function fetchChannelDiscovery(logins: string[], history: DiscoveryHistory[] = []): Promise<ChannelDiscoveryData> {
  const ids = [...new Set(history.flatMap((entry) => entry.vodId && /^\d{1,20}$/.test(entry.vodId) ? [entry.vodId] : []))].slice(0, 8);
  const [recentResult, videosResult] = await Promise.allSettled([
    logins.length ? discoveryGql<{ users: (DiscoveryChannel | null)[] }>(
      `query RecentChannels($logins: [String!]!) { users(logins: $logins) { ${DISCOVERY_CHANNEL_FIELDS} } }`, { logins }) : Promise.resolve({ users: [] }),
    ids.length ? discoveryGql<Record<string, WatchedVideo | null>>(`query WatchedCategories { ${ids.map((id, index) => `v${index}: video(id: "${id}") { id title game { name } owner { login } }`).join(" ")} }`) : Promise.resolve({}),
  ]);
  const users = recentResult.status === "fulfilled" ? recentResult.value.users.filter((user): user is DiscoveryChannel => Boolean(user)) : [];
  const recent = logins.flatMap((login) => users.find((channel) => channel.login.toLowerCase() === login) ?? []);
  const videos = videosResult.status === "fulfilled" ? Object.values(videosResult.value).filter((video): video is WatchedVideo => Boolean(video)) : [];
  const profile = buildDiscoveryProfile(history, recent, videos);
  const strongest = (map: Map<string, number>, limit: number) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key]) => key);
  const languages = strongest(profile.languages, 3).filter((language) => /^[a-z]{2}$/.test(language));
  const games = strongest(profile.games, 3);
  const seeds = strongest(profile.channels, 2);
  const [directoryResult, ...sourceResults] = await Promise.allSettled([
    directoryPage(languages),
    ...games.map((game) => discoveryGql<{ game?: { streams?: DiscoveryConnection; videos?: { edges: { node: { owner?: DiscoveryChannel | null } }[] } } }>(`query DiscoveryCategory($game: String!, $languages: [String!]) {
      game(name: $game) {
        streams(first: 30, options: { languages: $languages, sort: VIEWER_COUNT }) { edges { node { broadcaster { ${DISCOVERY_CHANNEL_FIELDS} } } } }
        videos(first: 8, languages: $languages, types: [ARCHIVE], sort: TIME) { edges { node { owner { ${DISCOVERY_CHANNEL_FIELDS} } } } }
      }
    }`, { game, languages: languages.length ? languages : null }).then((data): DiscoveryCandidate[] => [
      ...connectionChannels(data.game?.streams).map((channel) => ({ channel, source: "category" as const, game })),
      ...(data.game?.videos?.edges.flatMap(({ node }) => node.owner ? [{ channel: node.owner, source: "archive" as const, game }] : []) ?? []),
    ])),
    ...seeds.map((seed) => discoveryGql<{ personalSections?: PersonalSection[]; user?: { primaryTeam?: { members?: { edges: { node: DiscoveryChannel }[] } } } }>(`query RelatedChannels($channel: String!) {
      personalSections(input: { sectionInputs: [SIMILAR_SECTION], contextChannelName: $channel, recommendationContext: { platform: "web" } }) {
        type items { ... on PersonalSectionChannel { user { ${DISCOVERY_CHANNEL_FIELDS} } } }
      }
      user(login: $channel) { primaryTeam { members(first: 12) { edges { node { ${DISCOVERY_CHANNEL_FIELDS} } } } } }
    }`, { channel: seed }).then((data): DiscoveryCandidate[] => [
      // Anonymous responses frequently substitute POPULAR_SECTION. That is not a relationship.
      ...(data.personalSections?.filter((section) => section.type === "SIMILAR_SECTION").flatMap((section) => section.items.flatMap(({ user }) => user ? [{ channel: user, source: "similar" as const, seed }] : [])) ?? []),
      ...(data.user?.primaryTeam?.members?.edges.map(({ node }) => ({ channel: node, source: "team" as const, seed })) ?? []),
    ])),
  ]);
  const discoveryResults = [directoryResult, ...sourceResults];
  if (discoveryResults.every((result) => result.status === "rejected")) {
    const failures = discoveryResults.flatMap((result) => result.status === "rejected" && result.reason instanceof DiscoveryUpstreamError ? [result.reason] : []);
    throw failures.find((error) => error.status === 429) ?? failures[0] ?? new DiscoveryUpstreamError(502, 15);
  }
  const sourced = sourceResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const directory: DiscoveryCandidate[] = directoryResult.status === "fulfilled" ? connectionChannels(directoryResult.value.streams).map((channel) => ({ channel, source: "directory" })) : [];
  const excluded = [...new Set([...logins, ...history.map((entry) => entry.channel.toLowerCase())])];
  const sections: ChannelDiscoveryData["sections"] = [];
  const personalized = rankDiscovery([...sourced.filter(({ channel }) => channel.stream), ...(profile.channels.size ? directory : [])], profile, excluded, 20);
  if (personalized.length) sections.push({ type: "RECOMMENDED_SECTION", description: "Based on your recent viewing, watched categories and available Twitch channel connections.", channels: personalized });
  const used = [...excluded, ...personalized.map((channel) => channel.login)];
  const explore = rankDiscovery(directory, profile, used, 30);
  if (explore.length) sections.push({ type: "POPULAR_SECTION", description: languages.length ? `More live channels in ${languages.map((language) => new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language).join(", ")}, ranked for your interests.` : "Explore live channels across Twitch.", channels: explore });
  const offline = rankDiscovery(sourced.filter(({ channel }) => !channel.stream), profile, used.concat(explore.map((channel) => channel.login)), 12);
  if (offline.length) sections.push({ type: "OFFLINE_SECTION", description: "Channels with recent broadcasts in your categories, or a Twitch connection to channels you watch.", channels: offline });
  // Twitch's directory cursors require browser integrity. Expand only other known
  // interests through ordinary first-page category queries, then stop honestly.
  const extraGames = [...new Set([
    ...strongest(profile.games, 6),
    ...recent.flatMap((channel) => channel.stream?.game?.name ?? channel.broadcastSettings?.game?.name ?? []),
  ])].filter((game) => !games.includes(game)).slice(0, 6);
  const next = createDiscoveryPlan(extraGames, languages);
  return { recent, sections, ...(next ? { next } : {}) };
}

export async function fetchPlaybackUrl(
  type: "live" | "vod",
  channelOrVod: string
): Promise<string> {
  const data = await gql<{
    streamPlaybackAccessToken?: { value: string; signature: string };
    videoPlaybackAccessToken?: { value: string; signature: string };
  }>(
    `query PlaybackAccessToken($isLive: Boolean!, $login: String!, $isVod: Boolean!, $vodID: ID!) {
      streamPlaybackAccessToken(
        channelName: $login,
        params: {
          platform: "site",
          playerBackend: "mediaplayer",
          playerType: "embed"
        }
      ) @include(if: $isLive) {
        value
        signature
      }
      videoPlaybackAccessToken(
        id: $vodID,
        params: {
          platform: "site",
          playerBackend: "mediaplayer",
          playerType: "embed"
        }
      ) @include(if: $isVod) {
        value
        signature
      }
    }`,
    {
      isLive: type === "live",
      login: type === "live" ? channelOrVod : "",
      isVod: type === "vod",
      vodID: type === "vod" ? channelOrVod : "",
    }
  );

  const token =
    type === "live"
      ? data.streamPlaybackAccessToken
      : data.videoPlaybackAccessToken;

  if (!token) {
    throw new Error("Playback access token unavailable");
  }

  const params = new URLSearchParams({
    allow_source: "true",
    allow_audio_only: "true",
    p: Math.floor(Math.random() * 999999).toString(),
    playlist_include_framerate: "true",
    sig: token.signature,
    supported_codecs: "h264",
    token: token.value,
  });

  const path =
    type === "live"
      ? `/api/v2/channel/hls/${encodeURIComponent(channelOrVod)}.m3u8`
      : `/vod/v2/${encodeURIComponent(channelOrVod)}.m3u8`;

  return `https://usher.ttvnw.net${path}?${params.toString()}`;
}

export function fetchLivePlaybackUrl(channel: string): Promise<string> {
  return fetchPlaybackUrl("live", channel);
}

export function fetchVodPlaybackUrl(vodId: string): Promise<string> {
  return fetchPlaybackUrl("vod", vodId);
}

interface VideoComment {
  id: string;
  contentOffsetSeconds: number;
  commenter: { displayName: string; login: string } | null;
  message: { fragments: { text: string }[]; userColor: string | null };
}

export async function fetchVodComments(vodId: string, offset: number) {
  const data = await gql<{
    video: { comments: {
      edges: { node: VideoComment }[];
      pageInfo: { hasNextPage: boolean };
    } | null } | null;
  }>(`query VideoComments($id: ID!, $offset: Int) {
    video(id: $id) {
      comments(contentOffsetSeconds: $offset) {
        edges {
          node {
            id
            contentOffsetSeconds
            commenter { displayName login }
            message { fragments { text } userColor }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }`, { id: vodId, offset: Math.floor(offset) });
  if (!data.video) throw new Error("Video not found");
  if (!data.video.comments) throw new Error("Chat replay is unavailable for this video");
  const { edges, pageInfo } = data.video.comments;
  return {
    messages: edges.map(({ node }) => ({
      id: node.id,
      user: node.commenter?.displayName || node.commenter?.login || "Deleted user",
      color: /^#[0-9a-f]{6}$/i.test(node.message.userColor ?? "") ? node.message.userColor : null,
      text: node.message.fragments.map((fragment) => fragment.text).join(""),
      offset: node.contentOffsetSeconds,
    })),
    // Offset lookups overlap the prior batch; clients deduplicate by message ID.
    // Cursor requests require Twitch browser integrity credentials.
    nextOffset: pageInfo.hasNextPage && edges.length
      ? Math.max(Math.floor(offset) + 1, Math.floor(edges.at(-1)!.node.contentOffsetSeconds) + 1)
      : null,
  };
}
