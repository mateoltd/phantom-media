export declare class VixsrcError extends Error {
  status: number | null;
  retryable: boolean;
  details: { stage: string } | null;
}

export declare function parseVixsrcEmbed(body: string, now?: number): URL;
export declare function parseVixsrcPlaylists(
  html: string,
  embed: URL,
  now?: number,
): { urls: string[]; expiresAt: number };
export declare function resolveVixsrc(
  media: { type: "movie" | "tv"; tmdbId: number; season?: number; episode?: number },
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<{
  variants: Array<{ url: string; type: "hls"; expiresAt: number; audioLanguages: string[]; deliveryMode: "native-direct" }>;
  subtitles: [];
  latencyMs: number;
}>;
export declare function createVixsrcResolver(id: string): (
  media: Parameters<typeof resolveVixsrc>[0],
  options?: Parameters<typeof resolveVixsrc>[1],
) => Promise<{ candidates: unknown[]; subtitles: []; latencyMs: number }>;
