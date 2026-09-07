export interface SourceAutostartTimers {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}

export declare function scheduleSourceAutostart(
  callback: () => void,
  timers?: SourceAutostartTimers,
): () => void;

export declare function scheduleSourceAutostartOnce(
  started: { current: string },
  key: string,
  callback: () => void,
  timers?: SourceAutostartTimers,
): (() => void) | undefined;
