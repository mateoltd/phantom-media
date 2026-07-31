export type SourceOutcome = "verified" | "empty" | "unreachable" | "limited";

export interface SourceObservation {
  sourceId: string;
  titleKey: string;
  outcome: SourceOutcome;
  /** Wall time of the resolver request. */
  resolveMs: number;
  /** How long the manifest we chose took to answer, null when none did. */
  probeMs: number | null;
  /** Best verified `qualityTier`, 0-4. */
  tier: number;
  attached: boolean;
  /** Attach to first frame, or null when it never attached. */
  ttffMs: number | null;
  /** Died within the stall window of attaching. */
  stalled: boolean;
}

/** Value, effective observation count, updatedAt. Short names: this is rewritten every race. */
export interface ScoreRecord {
  v: number;
  w: number;
  t: number;
}

export declare const HALF_LIFE_GLOBAL_MS: number;
export declare const HALF_LIFE_TITLE_MS: number;
export declare const WEIGHT_CAP: number;
export declare const PRIOR_VALUE: number;
export declare const PRIOR_WEIGHT: number;
export declare const EXPLORE_WEIGHT_FLOOR: number;
export declare const GLOBAL_PRIOR_WEIGHT: number;
export declare const TITLE_WEIGHT_CAP: number;

export declare function shouldRecord(
  observation: Pick<SourceObservation, "outcome">,
): boolean;
export declare function observationScopes(
  observation: Pick<SourceObservation, "outcome">,
): { global: boolean; title: boolean };
export declare function reward(
  observation: Omit<SourceObservation, "sourceId" | "titleKey">,
): number;

export declare function emptyRecord(now: number): ScoreRecord;
export declare function decayFactor(
  record: ScoreRecord | null | undefined,
  now: number,
  halfLifeMs: number,
): number;
export declare function update(
  record: ScoreRecord | null | undefined,
  reward: number,
  now: number,
  halfLifeMs: number,
): ScoreRecord;
export declare function posterior(
  record: ScoreRecord | null | undefined,
  now: number,
  halfLifeMs: number,
): number;
export declare function effectiveWeight(
  record: ScoreRecord | null | undefined,
  now: number,
  halfLifeMs: number,
): number;

export declare function titleKeyFor(
  mediaType: "movie" | "tv",
  id: string,
  season: number,
): string;
export declare function blendedScore(
  globalRecord: ScoreRecord | null | undefined,
  titleRecord: ScoreRecord | null | undefined,
  now: number,
): number;

export declare function mergeRecords(
  left: ScoreRecord | null | undefined,
  right: ScoreRecord | null | undefined,
): ScoreRecord | null;

export declare function coarseRegion(timeZone: string | undefined): string;
export declare function relocate(
  records: Record<string, ScoreRecord>,
): Record<string, ScoreRecord>;
