export type HlsStallRecoveryAction = "none" | "nudge" | "restart";

export declare const HLS_STALL_RECOVERY_DELAY_MS: number;
export declare const HLS_STALL_RECOVERY_LIMIT: number;
export declare const HLS_FRAGMENT_LOAD_POLICY: Readonly<{
  maxTimeToFirstByteMs: number;
  maxLoadTimeMs: number;
  timeoutRetry: Readonly<{
    maxNumRetry: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
  }>;
  errorRetry: Readonly<{
    maxNumRetry: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
  }>;
}>;

export declare function hlsStallRecoveryAction(input: {
  paused: boolean;
  seeking: boolean;
  ended: boolean;
  playbackRate: number;
  currentTime: number;
  readyState: number;
  bufferAheadSeconds: number;
}): HlsStallRecoveryAction;
