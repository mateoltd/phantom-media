export declare const SOURCE_IDS: readonly string[];
export declare const SOURCE_ALIASES: Readonly<Record<string, string>>;
export declare function sourceAlias(id: string): string;
export declare const SOURCE_ROSTER: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
}>;
