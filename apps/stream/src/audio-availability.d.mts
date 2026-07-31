export interface SourceAudioEvidence {
  readonly status?: string;
  readonly languages?: readonly string[];
}

export interface ActiveAudioTrack {
  readonly language?: string | null;
  readonly label?: string | null;
}

export declare function collectAvailableAudioLanguages(
  sourceEvidence: readonly SourceAudioEvidence[],
  activeTracks?: readonly ActiveAudioTrack[],
): string[];

export declare function orderAvailableAudioLanguages(
  languages: readonly string[],
  preferred: string,
): string[];
