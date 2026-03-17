import { Innertube } from "youtubei.js";
import type { QueryResult, VideoInfo } from "@/lib/types";
import { SEARCH_RESULT_LIMIT } from "@/lib/constants";
import { getInnertube, CLIENT_FALLBACK_ORDER } from "@/lib/youtube/client";

// Extract video ID from URL or string
function tryParseVideoId(query: string): string | null {
  // Direct ID: 11 chars alphanumeric + dash + underscore
  if (/^[a-zA-Z0-9_-]{11}$/.test(query)) return query;

  try {
    const url = new URL(query);
    // youtube.com/watch?v=ID
    if (
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtube-nocookie.com")
    ) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      // youtube.com/embed/ID or /v/ID or /shorts/ID
      const pathMatch = url.pathname.match(
        /^\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/
      );
      if (pathMatch) return pathMatch[1];
    }
    // youtu.be/ID
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // Not a URL
  }
  return null;
}

// Extract playlist ID from URL or string
function tryParsePlaylistId(query: string): string | null {
  // Direct playlist ID (starts with PL, RD, UU, OL, LL, WL, etc.)
  if (/^(PL|RD|UU|OL|LL|WL|FL|ML|UL)[a-zA-Z0-9_-]+$/.test(query))
    return query;

  try {
    const url = new URL(query);
    if (
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtube-nocookie.com")
    ) {
      const list = url.searchParams.get("list");
      if (list) return list;
    }
  } catch {
    // Not a URL
  }
  return null;
}

// Extract channel identifier from URL
function tryParseChannelIdentifier(
  query: string
): { type: "id" | "handle" | "slug"; value: string } | null {
  try {
    const url = new URL(query);
    if (!url.hostname.includes("youtube.com")) return null;

    // /channel/UC...
    const channelMatch = url.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return { type: "id", value: channelMatch[1] };

    // /@handle
    const handleMatch = url.pathname.match(/^\/@([a-zA-Z0-9._-]+)/);
    if (handleMatch) return { type: "handle", value: handleMatch[1] };

    // /c/slug or /user/name
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
    let items = [...playlist.items];

    // Load all pages
    let page = playlist;
    while (page.has_continuation) {
      page = await page.getContinuation();
      items.push(...page.items);
    }

    const videos: VideoInfo[] = items
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

  // Try youtubei.js with multiple client types to bypass bot detection
  const yt = await getInnertube();
  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const basic = info.basic_info;

      if (!basic?.title) continue;

      return {
        kind: "video",
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

  // Final fallback: oEmbed (lightweight, usually not bot-checked)
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("format", "json");

    const response = await fetch(url, { cache: "no-store" });
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

/**
 * Port of QueryResolver.cs - Resolves a query string to videos.
 * Priority: ? prefix search → playlist → video → channel → search fallback
 */
export async function resolveQuery(
  yt: Innertube | null,
  query: string
): Promise<QueryResult> {
  query = query.trim();

  // Force search with ? prefix
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
