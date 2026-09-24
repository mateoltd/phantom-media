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
