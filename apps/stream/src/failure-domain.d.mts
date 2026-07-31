export declare function failureDomainFor(sourceId: string): string;
export declare function fingerprintFailureLayer(seed: string): string;
export declare function capacityDomainsFor(sourceId: string): readonly string[];
export declare function shareFailureCapacity(
  left: string,
  right: string,
): boolean;
export declare function failureDomainLayers(sourceIds: readonly string[]): {
  ordered: string[];
  layerSizes: number[];
};
export declare function independentWave(
  sourceIds: readonly string[],
  requestedWave: number,
): { ordered: string[]; wave: number };
export declare function asSettledByFailureDomain<R>(
  sourceIds: readonly string[],
  limit: number,
  task: (sourceId: string) => Promise<R>,
): AsyncGenerator<{
  item: string;
  value?: R;
  error?: unknown;
}>;
