import { UpstreamError } from "./errors.ts";
/** A granted queued request owns the released permit, so it cannot be overtaken. */
export function createPermitPool(capacity: number, maxQueued: number) {
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(maxQueued) || maxQueued < 0) throw new Error("Invalid request budget");
  let active = 0;
  const queue: (() => void)[] = [];
  async function acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (active >= capacity) {
      if (queue.length >= maxQueued) throw new UpstreamError("cap");
      await new Promise<void>((resolve, reject) => {
        const abort = () => { const index = queue.indexOf(wake); if (index >= 0) queue.splice(index, 1); reject(signal?.reason); };
        const wake = () => { signal?.removeEventListener("abort", abort); resolve(); };
        queue.push(wake); signal?.addEventListener("abort", abort, { once: true });
      });
    } else active++;
    let released = false;
    return () => { if (released) return; released = true; const next = queue.shift(); if (next) next(); else active--; };
  }
  return {
    acquire,
    async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const release = await acquire(signal);
      try { signal?.throwIfAborted(); return await work(); } finally { release(); }
    },
  };
}
