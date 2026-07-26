export declare const SOURCE_IDS: readonly string[];
export declare const RETIRED_SOURCE_IDS: ReadonlySet<string>;
export declare const ACTIVE_SOURCE_IDS: readonly string[];
export declare const SOURCE_ALIASES: Readonly<Record<string, string>>;
export declare function sourceAlias(id: string): string;
export declare const SOURCE_ROSTER: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
}>;
