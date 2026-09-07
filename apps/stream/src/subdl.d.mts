import type { SubtitleTrack } from "../lib/types";
export declare function subdlFileUrl(raw: string): string | null;
export declare function subdlTracks(body: unknown, query: {
  imdbId: string; mediaType: string; season: number; episode: number;
}): SubtitleTrack[];
