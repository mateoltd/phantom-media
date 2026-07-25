import { Innertube } from "youtubei.js";
import type { QueryResult, VideoInfo } from "@/lib/types";
import { SEARCH_RESULT_LIMIT } from "@/lib/constants";
import { hasConfiguredProxySource } from "@/lib/server/proxy-pool";
import {
  getInnertube,
  CLIENT_FALLBACK_ORDER,
  fetchYouTube,
  withSessionRetry,
} from "@/lib/youtube/client";
import {
  primeVideoExtractionWithYtDlp,
  resolveCollectionWithYtDlp,
  resolveVideoWithYtDlp,
  searchWithYtDlp,
} from "@/lib/youtube/yt-dlp-metadata";

const PROXY_QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const PROXY_QUERY_CACHE_MAX_ENTRIES = 100;
const proxyQueryCache = new Map<
  string,
  { result: QueryResult; expiresAt: number }
>();
const proxyQueryInFlight = new Map<string, Promise<QueryResult>>();

function isYouTubeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "youtube.com" ||
    normalized.endsWith(".youtube.com") ||
    normalized === "youtube-nocookie.com" ||
    normalized.endsWith(".youtube-nocookie.com")
  );
}

function tryParseVideoId(query: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(query)) return query;

  try {
    const url = new URL(query);
    if (isYouTubeHostname(url.hostname)) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const pathMatch = url.pathname.match(
        /^\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/
      );
      if (pathMatch) return pathMatch[1];
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // Not a URL
  }
  return null;
}

function tryParsePlaylistId(query: string): string | null {
  if (/^(PL|RD|UU|OL|LL|WL|FL|ML|UL)[a-zA-Z0-9_-]+$/.test(query))
    return query;

  try {
    const url = new URL(query);
    if (isYouTubeHostname(url.hostname)) {
      const list = url.searchParams.get("list");
      if (list) return list;
    }
  } catch {
    // Not a URL
  }
  return null;
}

function tryParseChannelIdentifier(
  query: string
): { type: "id" | "handle" | "slug"; value: string } | null {
  try {
    const url = new URL(query);
    if (!isYouTubeHostname(url.hostname)) return null;

    const channelMatch = url.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return { type: "id", value: channelMatch[1] };

    const handleMatch = url.pathname.match(/^\/@([a-zA-Z0-9._-]+)/);
    if (handleMatch) return { type: "handle", value: handleMatch[1] };

    const slugMatch = url.pathname.match(/^\/(?:c|user)\/([a-zA-Z0-9._-]+)/);
    if (slugMatch) return { type: "slug", value: slugMatch[1] };
  } catch {
    // Not a URL
  }
  return null;
}

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function toVideoInfo(item: {
  id?: string;
  video_id?: string;
  title: { toString(): string };
  author: { id: string; name: string };
  duration?: { seconds: number };
  thumbnails?: { url: string }[];
}): VideoInfo {
  const id = item.id ?? item.video_id ?? "";
  return {
    id,
    title: item.title.toString(),
    author: item.author.name,
    authorId: item.author.id,
    duration: item.duration?.seconds ?? 0,
    thumbnailUrl:
      item.thumbnails?.[item.thumbnails.length - 1]?.url ?? thumbnailUrl(id),
  };
}

async function tryResolvePlaylist(
  yt: Innertube,
  query: string
): Promise<QueryResult | null> {
  const playlistId = tryParsePlaylistId(query);
  if (!playlistId) return null;

  // Skip personal playlists
  if (["WL", "LL", "LM"].some((p) => playlistId.startsWith(p))) return null;

  try {
    const playlist = await yt.getPlaylist(playlistId);
    const maxItems = readPositiveInteger(
      process.env.RESOLVE_MAX_PLAYLIST_ITEMS,
      100
    );
    let items = [...playlist.items];

    // Continuations are bounded so one request cannot exhaust the server.
    let page = playlist;
    while (page.has_continuation && items.length < maxItems) {
      page = await page.getContinuation();
      items.push(...page.items);
    }

    const videos: VideoInfo[] = items
      .slice(0, maxItems)
      .filter(
        (item) => "id" in item && "title" in item && "author" in item
      )
      .map((item) =>
        toVideoInfo(
          item as unknown as {
            id: string;
            title: { toString(): string };
            author: { id: string; name: string };
            duration?: { seconds: number };
            thumbnails?: { url: string }[];
          }
        )
      );

    return {
      kind: "playlist",
      title: playlist.info?.title ?? "Playlist",
      videos,
    };
  } catch {
    return null;
  }
}

async function tryResolveVideo(
  query: string
): Promise<QueryResult | null> {
  const videoId = tryParseVideoId(query);
  if (!videoId) return null;

  try {
    return await withSessionRetry(async (yt) => {
      for (const client of CLIENT_FALLBACK_ORDER) {
        try {
          const info = await yt.getBasicInfo(videoId, { client });
          const basic = info.basic_info;

          if (!basic?.title) continue;

          return {
            kind: "video" as const,
            title: basic.title,
            videos: [
              {
                id: basic.id ?? videoId,
                title: basic.title,
                author: basic.author ?? basic.channel?.name ?? "Unknown",
                authorId: basic.channel_id ?? basic.channel?.id ?? "",
                duration: basic.duration ?? 0,
                thumbnailUrl:
                  basic.thumbnail?.[basic.thumbnail.length - 1]?.url ??
                  thumbnailUrl(videoId),
                viewCount: basic.view_count ?? undefined,
              },
            ],
          };
        } catch {
          // Try next client type
        }
      }
      throw new Error("All clients failed");
    });
  } catch {
    // All Innertube attempts failed, so fall through to oEmbed.
  }

  return resolveVideoFromOEmbed(videoId);
}

async function resolveVideoFromOEmbed(
  videoId: string
): Promise<QueryResult | null> {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("format", "json");

    const response = await fetchYouTube(url, { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    if (!data.title) return null;

    return {
      kind: "video",
      title: data.title,
      videos: [
        {
          id: videoId,
          title: data.title,
          author: data.author_name ?? "Unknown",
          authorId: "",
          duration: 0,
          thumbnailUrl: data.thumbnail_url ?? thumbnailUrl(videoId),
        },
      ],
    };
  } catch {
    return null;
  }
}

async function tryResolveChannel(
  yt: Innertube,
  query: string
): Promise<QueryResult | null> {
  const channelId = tryParseChannelIdentifier(query);
  if (!channelId) return null;

  try {
    const channel = await yt.getChannel(channelId.value);
    const tab = await channel.getVideos();
    const videos: VideoInfo[] = [];

    for (const item of tab.videos) {
      if ("id" in item && "title" in item && "author" in item) {
        videos.push(
          toVideoInfo(
            item as {
              id: string;
              title: { toString(): string };
              author: { id: string; name: string };
              duration?: { seconds: number };
              thumbnails?: { url: string }[];
            }
          )
        );
      }
    }

    return {
      kind: "channel",
      title: channel.metadata?.title ?? "Channel",
      videos,
    };
  } catch {
    return null;
  }
}

async function resolveSearch(
  yt: Innertube,
  query: string
): Promise<QueryResult> {
  const search = await yt.search(query, { type: "video" });
  const videos: VideoInfo[] = [];

  for (const item of search.results ?? []) {
    if (item.type !== "Video") continue;
    const v = item as unknown as {
      video_id: string;
      title: { toString(): string };
      author: { id: string; name: string };
      duration?: { seconds: number };
      thumbnails?: { url: string }[];
      view_count?: { toString(): string };
    };
    const info = toVideoInfo(v);
    const viewText = v.view_count?.toString();
    if (viewText) {
      const parsed = parseInt(viewText.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(parsed)) info.viewCount = parsed;
    }
    videos.push(info);
    if (videos.length >= SEARCH_RESULT_LIMIT) break;
  }

  return {
    kind: "search",
    title: `Search: ${query}`,
    videos,
  };
}

async function resolveProxyQuery(query: string): Promise<QueryResult> {
  const cacheKey = proxyQueryCacheKey(query);
  const cached = proxyQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    proxyQueryCache.delete(cacheKey);
    proxyQueryCache.set(cacheKey, cached);
    return cached.result;
  }
  if (cached) proxyQueryCache.delete(cacheKey);

  const existing = proxyQueryInFlight.get(cacheKey);
  if (existing) return existing;

  const resolution = resolveProxyQueryUncached(query);
  proxyQueryInFlight.set(cacheKey, resolution);
  try {
    const result = await resolution;
    proxyQueryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + PROXY_QUERY_CACHE_TTL_MS,
    });
    while (proxyQueryCache.size > PROXY_QUERY_CACHE_MAX_ENTRIES) {
      const oldestKey = proxyQueryCache.keys().next().value;
      if (!oldestKey) break;
      proxyQueryCache.delete(oldestKey);
    }
    return result;
  } finally {
    proxyQueryInFlight.delete(cacheKey);
  }
}

function proxyQueryCacheKey(query: string): string {
  const normalized = query.trim();
  if (normalized.startsWith("?")) {
    return `search:${normalized.slice(1).trim().toLowerCase()}`;
  }

  const videoId = tryParseVideoId(normalized);
  if (videoId) return `video:${videoId}`;

  const playlistId = tryParsePlaylistId(normalized);
  if (playlistId) return `playlist:${playlistId}`;

  const channel = tryParseChannelIdentifier(normalized);
  if (channel) return `channel:${channel.type}:${channel.value.toLowerCase()}`;

  return `search:${normalized.toLowerCase()}`;
}

async function resolveProxyQueryUncached(query: string): Promise<QueryResult> {
  if (query.startsWith("?")) {
    return searchWithYtDlp(query.slice(1).trim(), SEARCH_RESULT_LIMIT);
  }

  const videoId = tryParseVideoId(query);
  if (videoId) {
    const priming = primeVideoExtractionWithYtDlp(videoId);
    void priming.catch(() => undefined);

    return (
      (await resolveVideoFromOEmbed(videoId)) ??
      (await resolveVideoWithYtDlp(videoId))
    );
  }

  const playlistId = tryParsePlaylistId(query);
  if (playlistId) {
    const maxItems = readPositiveInteger(
      process.env.RESOLVE_MAX_PLAYLIST_ITEMS,
      100
    );
    return resolveCollectionWithYtDlp(
      `https://www.youtube.com/playlist?list=${playlistId}`,
      "playlist",
      maxItems
    );
  }

  if (tryParseChannelIdentifier(query)) {
    const maxItems = readPositiveInteger(
      process.env.RESOLVE_MAX_PLAYLIST_ITEMS,
      100
    );
    return resolveCollectionWithYtDlp(query, "channel", maxItems);
  }

  return searchWithYtDlp(query, SEARCH_RESULT_LIMIT);
}

export async function resolveQuery(
  yt: Innertube | null,
  query: string
): Promise<QueryResult> {
  query = query.trim();

  if (hasConfiguredProxySource()) {
    return resolveProxyQuery(query);
  }

  if (query.startsWith("?")) {
    yt ??= await getInnertube();
    return resolveSearch(yt, query.slice(1).trim());
  }

  const directVideo = await tryResolveVideo(query);
  if (directVideo) {
    return directVideo;
  }

  yt ??= await getInnertube();

  return (
    (await tryResolvePlaylist(yt, query)) ??
    (await tryResolveChannel(yt, query)) ??
    (await resolveSearch(yt, query))
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
