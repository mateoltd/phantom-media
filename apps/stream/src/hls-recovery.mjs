export const HLS_STALL_RECOVERY_DELAY_MS = 4_000;
export const HLS_STALL_RECOVERY_LIMIT = 2;

export const HLS_FRAGMENT_LOAD_POLICY = Object.freeze({
  maxTimeToFirstByteMs: 8_000,
  maxLoadTimeMs: 25_000,
  timeoutRetry: Object.freeze({
    maxNumRetry: 2,
    retryDelayMs: 500,
    maxRetryDelayMs: 4_000,
  }),
  errorRetry: Object.freeze({
    maxNumRetry: 4,
    retryDelayMs: 750,
    maxRetryDelayMs: 8_000,
  }),
});

export function hlsStallRecoveryAction(input) {
  if (
    input.paused ||
    input.seeking ||
    input.ended ||
    input.playbackRate === 0 ||
    !Number.isFinite(input.currentTime)
  ) {
    return "none";
  }
  if (input.bufferAheadSeconds >= 0.5) return "nudge";
  if (input.readyState < 3 && input.bufferAheadSeconds < 0.25) {
    return "restart";
  }
  return "none";
}
