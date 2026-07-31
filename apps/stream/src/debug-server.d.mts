export declare function serverDebugEnabled(
  env?: Record<string, string | undefined>,
): boolean;
export declare function debugLogPath(
  env?: Record<string, string | undefined>,
): string;
export declare function normalizeTraceId(value: unknown): string | null;
export declare function appendClientDebugEntries(
  sessionId: unknown,
  entries: readonly unknown[],
): Promise<unknown>;
export declare function installServerDebugSink(): boolean;
export declare function withServerDebugTrace<T>(
  traceId: unknown,
  callback: () => T,
): T;
