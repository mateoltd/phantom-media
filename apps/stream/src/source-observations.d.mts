import type {
  SourcePlaybackHints,
  StreamCandidate,
} from "../lib/types";

export declare const SOURCE_PLAYBACK_OBSERVATIONS: Readonly<
  Record<string, SourcePlaybackHints>
>;

export declare function sourcePlaybackHints(
  sourceId: string,
): SourcePlaybackHints | null;

export declare function fallbackPreferenceForHints(
  hints: SourcePlaybackHints | null | undefined,
  preferredAudioLanguage: string | null | undefined,
): number;

export declare function unverifiedFallbackPreference(
  candidate: StreamCandidate | null | undefined,
  preferredAudioLanguage: string | null | undefined,
): number;

export declare function fallbackPlaybackPreferenceForHints(
  hints: SourcePlaybackHints | null | undefined,
): number;

export declare function unverifiedFallbackPlaybackPreference(
  candidate: StreamCandidate | null | undefined,
): number;
