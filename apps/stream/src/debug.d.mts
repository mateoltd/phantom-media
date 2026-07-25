export declare const DEFAULT_LIMIT: number;
export declare const CHANNELS: readonly string[];

export type DebugChannel =
  | "router"
  | "source"
  | "probe"
  | "attach"
  | "score"
  | "relay"
  | "subtitles"
  | "route";

export interface LogEntry {
  seq: number;
  /** Milliseconds since the log was created. */
  t: number;
  channel: DebugChannel;
  event: string;
  data: Record<string, unknown> | null;
}

export interface LogStats {
  kept: number;
  dropped: number;
  limit: number;
  emitted: number;
}

export interface EventLog {
  event(
    channel: DebugChannel,
    name: string,
    data?: unknown,
  ): LogEntry | undefined;
  /** Returns the function that closes the span and records its duration. */
  span(
    channel: DebugChannel,
    name: string,
    data?: unknown,
  ): (extra?: unknown) => LogEntry | undefined;
  entries(): LogEntry[];
  readonly enabled: boolean;
  setEnabled(next: boolean): boolean;
  setSink(next: ((entry: LogEntry) => void) | null): void;
  clear(): void;
  stats(): LogStats;
}

export interface LogSummary {
  entries: number;
  spanMs: number;
  channels: Record<string, number>;
  slowest: {
    at: number;
    event: string;
    ms: number;
    data: Record<string, unknown> | null;
  }[];
}

export declare function createEventLog(options?: {
  limit?: number;
  clock?: () => number;
  enabled?: boolean;
  sink?: ((entry: LogEntry) => void) | null;
}): EventLog;

export declare function formatEntry(entry: LogEntry): string;
export declare function summarize(entries: readonly LogEntry[]): LogSummary;
export declare function sharedLog(): EventLog;
export declare function debugEvent(
  channel: DebugChannel,
  name: string,
  data?: unknown,
): LogEntry | undefined;
export declare function debugSpan(
  channel: DebugChannel,
  name: string,
  data?: unknown,
): (extra?: unknown) => LogEntry | undefined;
