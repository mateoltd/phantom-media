export declare class VidzeeError extends Error {
  status: number | null;
  retryable: boolean;
  details: { stage: string } | null;
}
export declare function parseVidzeeStream(body: string): URL;
export declare function resolveVidzee(
  media: { type: "movie" | "tv"; tmdbId: number; season?: number; episode?: number; audioLanguage?: string },
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch; proxyOrigin?: string },
): Promise<{
  variants: Array<{ url: string; type: "hls"; deliveryMode: "native-direct"; audioLanguages: string[]; embeddedAudioLanguage: "en" | undefined }>;
  subtitles: [];
  latencyMs: number;
}>;
export declare function createVidzeeResolver(id: string): (
  media: Parameters<typeof resolveVidzee>[0],
  options?: Parameters<typeof resolveVidzee>[1],
) => Promise<{ candidates: unknown[]; subtitles: []; latencyMs: number }>;
