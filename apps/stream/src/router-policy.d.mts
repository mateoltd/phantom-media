import type { StreamCandidate, SubtitleTrack } from "../lib/types";

/** What the policy is allowed to know about the score store. */
export interface ScoreSnapshot {
  readonly now: number;
  /** Blended global-and-title posterior, in [0, 1]. */
  score(sourceId: string): number;
  /** Decayed global observation count. */
  weight(sourceId: string): number;
  /** Decayed observation count for the title on screen. */
  titleWeight(sourceId: string): number;
}

export interface SourceOffer {
  sourceId: string;
  label: string;
  /** At least one manifest answered with a real playlist. */
  verified: boolean;
  /** Best tier among verified candidates, 0-4. */
  verifiedTier: number;
  /** Resolve plus probe, for choosing between offers that both arrived. */
  totalMs: number;
  ranked: StreamCandidate[];
  attempts: StreamCandidate[];
  subtitles: SubtitleTrack[];
  resolveMs: number;
  probeMs: number | null;
}

export type FailureKind = "empty" | "unreachable" | "limited";

export type RouterEvent =
  | { type: "offer"; offer: SourceOffer }
  | {
      type: "failure";
      sourceId: string;
      kind: FailureKind;
      retryAfterMs: number | null;
    }
  | { type: "tick" }
  | { type: "attachFailed"; sourceId: string }
  | { type: "exhausted" };

export type RouterAction =
  | { type: "continue" }
  | { type: "attach"; offer: SourceOffer }
  | {
      type: "stop";
      reason: "rateLimited" | "exhausted";
      cooldownMs: number;
    };

export interface RaceState {
  raceStartedAt: number;
  held: SourceOffer | null;
  graceUntil: number;
  attaching: string | null;
  cooldownHintMs: number;
  sawRateLimit: boolean;
  exhausted: boolean;
}

export interface OrderOptions {
  pinned?: string | null;
  /** sourceId -> timestamp the in-memory cooldown expires. */
  cooling?: Record<string, number>;
  now?: number;
}

export declare const MAX_WAVE: number;
export declare const MIN_WAVE: number;
export declare const GRACE_MS: number;
export declare const HARD_MS: number;
export declare const SOURCE_COOLDOWN_MS: number;
export declare const CONFIDENT_FAIL_SCORE: number;
export declare const CONFIDENT_FAIL_WEIGHT: number;
export declare const RATE_LIMIT_COOLDOWN_MS: number;
export declare const MIN_COOLDOWN_MS: number;
export declare const MAX_COOLDOWN_MS: number;
export declare const EXPLORE_WEIGHT_FLOOR: number;
export declare const TITLE_WEIGHT_CAP: number;

export declare function orderSources(
  sources: readonly string[],
  snapshot: ScoreSnapshot,
  options?: OrderOptions,
): string[];
export declare function nextWaveSize(
  current: number,
  sawRateLimit: boolean,
): number;

export declare function bestVerifiedTier(offer: SourceOffer): number;
export declare function isExcellent(offer: SourceOffer): boolean;
export declare function isGoodEnough(
  offer: SourceOffer,
  snapshot: ScoreSnapshot,
): boolean;
export declare function offerScore(
  offer: SourceOffer,
  snapshot: ScoreSnapshot,
): number;
export declare function graceDeadline(
  now: number,
  raceStartedAt: number,
): number;

export declare function initialRaceState(now: number): RaceState;
export declare function raceStep(
  state: RaceState,
  event: RouterEvent,
  now: number,
  snapshot: ScoreSnapshot,
): { state: RaceState; action: RouterAction };

export declare function describeSource(
  snapshot: ScoreSnapshot,
  sourceId: string,
): string;
