export class PlaybackRecoveryState {
  #attempts = 0;
  #failed = new Set();

  constructor(maxAttempts = 2) {
    this.maxAttempts = Math.max(0, Number(maxAttempts) || 0);
  }

  recordFailure(sourceId, unstable = true) {
    this.#failed.add(sourceId);
    if (!unstable) this.#attempts = 0;
    if (this.#attempts >= this.maxAttempts) return false;
    this.#attempts += 1;
    return true;
  }

  eligible(sourceIds) {
    return sourceIds.filter((sourceId) => !this.#failed.has(sourceId));
  }

  reset() {
    this.#attempts = 0;
    this.#failed.clear();
  }

  get attempts() {
    return this.#attempts;
  }
}
