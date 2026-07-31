export declare class PlaybackRecoveryState {
  constructor(maxAttempts?: number);
  readonly maxAttempts: number;
  readonly attempts: number;
  recordFailure(sourceId: string, unstable?: boolean): boolean;
  eligible(sourceIds: readonly string[]): string[];
  reset(): void;
}
