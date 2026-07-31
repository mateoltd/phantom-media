import type { SourcePlaybackHints } from "../../lib/types";

export interface ProviderDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly deliveryMode:
    | "native-direct"
    | "resolver"
    | "resolver-full-relay";
  readonly autoRace: boolean;
  readonly failureDomain: string;
  readonly capacityDomains: readonly string[];
  readonly playbackHints: SourcePlaybackHints | null;
  readonly manifestUrl?: string;
  /** Always an in-house alias. A provider never sets this. */
  readonly label: string;
}

export declare const PROVIDER_CATALOG: readonly ProviderDescriptor[];
export declare const PROVIDER_KINDS: readonly string[];
export declare function providerDescriptor(
  id: string,
): ProviderDescriptor | null;
