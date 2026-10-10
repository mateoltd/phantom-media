const FAILURE_WINDOW_MS = 15_000;
const STALL_THRESHOLD_MS = 3_000;
const RECOVERY_MS = 15_000;

// Missing captions and deliberate request aborts do not affect media delivery.
export const CONNECTION_ERROR_DETAILS = new Set([
  "manifestLoadError", "manifestLoadTimeOut", "levelLoadError", "levelLoadTimeOut",
  "fragLoadError", "fragLoadTimeOut", "audioTrackLoadError", "audioTrackLoadTimeOut",
  "keyLoadError", "keyLoadTimeOut",
]);

/** Delivery health, independent of advertised resolution or source encoding. */
export function createConnectionHealth() {
  let unstable = false;
  let failures: number[] = [];
  let slowLoads: number[] = [];
  let starvedSince: number | null = null;
  let healthySince: number | null = null;

  const warn = () => {
    unstable = true;
    healthySince = null;
  };

  return {
    get unstable() { return unstable; },
    networkError(now: number, fatal = false) {
      failures = failures.filter(time => now - time <= FAILURE_WINDOW_MS);
      failures.push(now);
      healthySince = null;
      if (fatal || failures.length >= 2) warn();
    },
    fragmentLoaded(now: number, loadMs: number, durationSeconds: number) {
      if (!Number.isFinite(loadMs) || !Number.isFinite(durationSeconds) || loadMs <= 0 || durationSeconds <= 0) return;
      // Compare delivery speed with media duration, not the stream's bitrate.
      if (loadMs >= durationSeconds * 1_000) {
        slowLoads = slowLoads.filter(time => now - time <= FAILURE_WINDOW_MS);
        slowLoads.push(now);
        healthySince = null;
        if (slowLoads.length >= 2) warn();
      } else {
        slowLoads = [];
      }
    },
    playback(now: number, state: { active: boolean; starved: boolean; progressing: boolean; online: boolean }) {
      if (!state.online) {
        warn();
        return;
      }
      // Startup, paused playback, seeks, ended videos and hidden tabs are not stalls.
      if (!state.active) {
        starvedSince = null;
        healthySince = null;
        return;
      }
      if (state.starved) {
        starvedSince ??= now;
        healthySince = null;
        if (now - starvedSince >= STALL_THRESHOLD_MS) warn();
        return;
      }
      starvedSince = null;
      if (!state.progressing) {
        healthySince = null;
        return;
      }
      healthySince ??= now;
      if (unstable && now - healthySince >= RECOVERY_MS) {
        unstable = false;
        failures = [];
        slowLoads = [];
      }
    },
    resetPlayback() {
      starvedSince = null;
      healthySince = null;
    },
  };
}
