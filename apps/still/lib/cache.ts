interface Entry<T> { value: T; expires: number; weight: number }

/** Bounded LRU with coalescing. Caller cancellation never aborts a shared load. */
export class ResourceCache<T> {
  private entries = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<T>>();
  private weight = 0;
  private capacity: number;
  private maxWeight: number;
  private weigh: (value: T) => number;
  constructor(capacity = 64, maxWeight = Infinity, weigh: (value: T) => number = () => 1) {
    this.capacity = capacity; this.maxWeight = maxWeight; this.weigh = weigh;
  }

  peek(key: string): T | undefined { return this.entries.get(key)?.value; }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= Date.now()) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, ttl: number): void {
    const old = this.entries.get(key);
    if (old) { this.weight -= old.weight; this.entries.delete(key); }
    const weight = this.weigh(value);
    if (weight > this.maxWeight) return;
    this.entries.set(key, { value, weight, expires: Date.now() + ttl });
    this.weight += weight;
    while (this.entries.size > this.capacity || this.weight > this.maxWeight) {
      const first = this.entries.keys().next().value!;
      this.weight -= this.entries.get(first)!.weight;
      this.entries.delete(first);
    }
  }
  load(key: string, loader: () => Promise<T>, ttl: number | ((value: T) => number), signal?: AbortSignal): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return waitFor(Promise.resolve(cached), signal);
    let result = this.pending.get(key);
    if (!result) {
      if (this.pending.size >= this.capacity) return Promise.reject(new Error("Request budget exhausted"));
      result = Promise.resolve().then(loader).then(value => {
        this.set(key, value, typeof ttl === "number" ? ttl : ttl(value));
        return value;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, result);
    }
    return waitFor(result, signal);
  }
}

export function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
