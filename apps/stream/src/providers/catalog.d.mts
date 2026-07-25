export interface ProviderDescriptor {
  readonly id: string;
  readonly kind: string;
  /** Always an in-house alias. A provider never sets this. */
  readonly label: string;
}

export declare const PROVIDER_CATALOG: readonly ProviderDescriptor[];
export declare const PROVIDER_KINDS: readonly string[];
export declare function providerDescriptor(
  id: string,
): ProviderDescriptor | null;
