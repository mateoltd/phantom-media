import { SERVERS } from "./constants.mjs";
import { failureDomainFor } from "./failure-domain.mjs";

const DEFAULT_COOLDOWN_MS = 15_000;
const RATE_LIMIT_COOLDOWN_MS = 90_000;

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
  #domainStates;
  #domainFor;

  constructor(servers = SERVERS, options = {}) {
    this.servers = [...servers];
    this.#domainFor =
      options.failureDomainFor ??
      ((server) => failureDomainFor(server));
    this.#states = new Map(this.servers.map((server) => [server, initialState()]));
    this.#domainStates = new Map(
      this.servers.map((server) => [this.#domainFor(server), initialState()]),
    );
  }

  recordSuccess(server, latencyMs) {
    const state = this.#get(server);
    const domainState = this.#getDomain(server);
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    state.lastError = null;
    state.latencyMs =
      state.latencyMs == null
        ? latencyMs
        : Math.round(state.latencyMs * 0.7 + latencyMs * 0.3);
    domainState.successes += 1;
    domainState.consecutiveFailures = 0;
    domainState.cooldownUntil = 0;
    domainState.lastError = null;
    domainState.latencyMs =
      domainState.latencyMs == null
        ? latencyMs
        : Math.round(domainState.latencyMs * 0.7 + latencyMs * 0.3);
  }

  recordFailure(server, error, now = Date.now()) {
    const state = this.#get(server);
    const domainState = this.#getDomain(server);
    const status = Number(error?.status);
    const retryAfterMs = Number(error?.retryAfterMs);

    const cooldownUntil =
      now +
      (Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : status === 429
          ? RATE_LIMIT_COOLDOWN_MS
          : Math.min(
              DEFAULT_COOLDOWN_MS *
                (Math.max(
                  state.consecutiveFailures,
                  domainState.consecutiveFailures,
                ) +
                  1),
              MAX_COOLDOWN_MS,
            ));
    for (const target of [state, domainState]) {
      target.failures += 1;
      target.consecutiveFailures += 1;
      target.lastError = error?.message ?? String(error);
      target.cooldownUntil = Math.max(target.cooldownUntil, cooldownUntil);
    }
  }

  rank(preferred = this.servers, now = Date.now()) {
    const priority = new Map(preferred.map((server, index) => [server, index]));

    return [...preferred]
      .filter((server) => this.#states.has(server))
      .sort((left, right) => {
        const a = this.#get(left);
        const b = this.#get(right);
        const aDomain = this.#getDomain(left);
        const bDomain = this.#getDomain(right);
        const aCooling = Math.max(a.cooldownUntil, aDomain.cooldownUntil) > now;
        const bCooling = Math.max(b.cooldownUntil, bDomain.cooldownUntil) > now;

        if (aCooling !== bCooling) return aCooling ? 1 : -1;

        const aScore =
          Math.max(a.consecutiveFailures, aDomain.consecutiveFailures) * 1_000 +
          (a.latencyMs ?? 500) +
          (priority.get(left) ?? 99) * 100;
        const bScore =
          Math.max(b.consecutiveFailures, bDomain.consecutiveFailures) * 1_000 +
          (b.latencyMs ?? 500) +
          (priority.get(right) ?? 99) * 100;

        return aScore - bScore;
      });
  }

  available(preferred = this.servers, now = Date.now()) {
    return this.rank(preferred, now).filter(
      (server) => this.cooldownRemaining(server, now) === 0,
    );
  }

  cooldownRemaining(server, now = Date.now()) {
    return Math.max(
      0,
      Math.max(
        this.#get(server).cooldownUntil,
        this.#getDomain(server).cooldownUntil,
      ) - now,
    );
  }

  snapshot() {
    return Object.fromEntries(
      this.servers.map((server) => [
        server,
        {
          ...this.#get(server),
          failureDomain: this.#domainFor(server),
          domainCooldownUntil: this.#getDomain(server).cooldownUntil,
        },
      ]),
    );
  }

  #get(server) {
    const state = this.#states.get(server);
    if (!state) throw new TypeError(`Unknown server: ${server}`);
    return state;
  }

  #getDomain(server) {
    const domain = this.#domainFor(server);
    const state = this.#domainStates.get(domain);
    if (!state) throw new TypeError(`Unknown failure domain: ${domain}`);
    return state;
  }
}
