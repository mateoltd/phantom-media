export interface ComparableTrack {
  lang?: string;
  origin?: "source" | "opensubtitles";
  /** Position in the catalogue's own ordering, used only to break ties. */
  rank?: number;
}

export declare function normalizeLanguage(code: string | undefined): string;
export declare function languageName(code: string | undefined): string;
export declare function looksLikeWebVtt(text: string): boolean;
export declare function toWebVtt(text: string): string;
export declare function compareTracks(
  left: ComparableTrack,
  right: ComparableTrack,
  preferred?: readonly string[],
): number;
