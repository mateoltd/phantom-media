import type { Lifecycle } from "../contracts.ts";

export function playbackTtl(lifecycle: Lifecycle): number { return lifecycle === "complete" ? 30_000 : 5_000; }
export function playbackCacheControl(lifecycle: Lifecycle): string {
  return lifecycle === "complete" ? "public, max-age=30, s-maxage=30, must-revalidate" : "no-store";
}
