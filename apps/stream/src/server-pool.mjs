import { SERVERS } from "./constants.mjs";

const DEFAULT_COOLDOWN_MS = 15_000;
const RATE_LIMIT_COOLDOWN_MS = 90_000;

/**
 * The ceiling on the ordinary failure ladder.
 *
 * It used to climb to two minutes, which is longer than anyone waits and
 * longer than the client's own sixty-second cooldown — so a source would be
 * skipped by the router, come back, get an instant 503 from a pool that was
 * still sulking, and be skipped again. Two layers of cooldown that disagree
 * about the length is worse than either alone. A minute is what the client
 * uses, so it is what this uses.
 */
const MAX_COOLDOWN_MS = 60_000;

function initialState() {
  return {
    successes: 0,
    failures: 0,
    consecutiveFailures: 0,
    latencyMs: null,
    cooldownUntil: 0,
    lastError: null,
  };
}

export class ServerPool {
  #states;

  constructor(servers = SERVERS) {
    this.servers = [...servers];
    this.#states = new Map(this.servers.map((server) => [server, initialState()]));
  }

  recordSuccess(server, latencyMs) {
    const state = this.#get(server);
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    state.lastError = null;
    state.latencyMs =
      state.latencyMs == null
        ? latencyMs
        : Math.round(state.latencyMs * 0.7 + latencyMs * 0.3);
  }

  recordFailure(server, error, now = Date.now()) {
    const state = this.#get(server);
    const status = Number(error?.status);
    const retryAfterMs = Number(error?.retryAfterMs);

    state.failures += 1;
    state.consecutiveFailures += 1;
    state.lastError = error?.message ?? String(error);
    state.cooldownUntil =
      now +
      (Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : status === 429
          ? RATE_LIMIT_COOLDOWN_MS
          : Math.min(
              DEFAULT_COOLDOWN_MS * state.consecutiveFailures,
              MAX_COOLDOWN_MS,
            ));
  }

  rank(preferred = this.servers, now = Date.now()) {
    const priority = new Map(preferred.map((server, index) => [server, index]));

    return [...preferred]
      .filter((server) => this.#states.has(server))
      .sort((left, right) => {
        const a = this.#get(left);
        const b = this.#get(right);
        const aCooling = a.cooldownUntil > now;
        const bCooling = b.cooldownUntil > now;

        if (aCooling !== bCooling) return aCooling ? 1 : -1;

        const aScore =
          a.consecutiveFailures * 1_000 +
          (a.latencyMs ?? 500) +
          (priority.get(left) ?? 99) * 100;
        const bScore =
          b.consecutiveFailures * 1_000 +
          (b.latencyMs ?? 500) +
          (priority.get(right) ?? 99) * 100;

        return aScore - bScore;
      });
  }

  available(preferred = this.servers, now = Date.now()) {
    return this.rank(preferred, now).filter(
      (server) => this.#get(server).cooldownUntil <= now,
    );
  }

  cooldownRemaining(server, now = Date.now()) {
    return Math.max(0, this.#get(server).cooldownUntil - now);
  }

  snapshot() {
    return Object.fromEntries(
      this.servers.map((server) => [server, { ...this.#get(server) }]),
    );
  }

  #get(server) {
    const state = this.#states.get(server);
    if (!state) throw new TypeError(`Unknown server: ${server}`);
    return state;
  }
}
