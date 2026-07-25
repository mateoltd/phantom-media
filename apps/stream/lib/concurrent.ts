export interface Settled<T, R> {
  item: T;
  value?: R;
  error?: unknown;
}

/**
 * Runs `task` over `items` with a fixed number in flight and yields each one
 * as it settles, fastest first.
 *
 * Asking one source at a time is what made finding a stream feel slow: most of
 * that wait was a handful of dead hosts timing out in sequence. Consuming this
 * lazily also means the work stops as soon as the caller stops asking.
 */
export async function* asSettled<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): AsyncGenerator<Settled<T, R>> {
  const inFlight = new Map<number, Promise<Settled<T, R> & { key: number }>>();
  let next = 0;

  const start = () => {
    const key = next;
    const item = items[key];
    if (item === undefined) return;
    next += 1;
    inFlight.set(
      key,
      task(item).then(
        (value) => ({ key, item, value }),
        (error: unknown) => ({ key, item, error }),
      ),
    );
  };

  while (inFlight.size < limit && next < items.length) start();

  while (inFlight.size > 0) {
    const settled = await Promise.race(inFlight.values());
    inFlight.delete(settled.key);
    if (next < items.length) start();
    yield settled;
  }
}
