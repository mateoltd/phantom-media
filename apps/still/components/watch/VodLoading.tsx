import { ProgressRail } from "@phantom/ui";

/** Shared by the server fallback and the player's initial client render. */
export function VodLoading() {
  return (
    <main className="workspace-canvas still-main still-vod-loading relative">
      <div className="relative mx-auto flex min-h-[calc(100svh-var(--media-header-height))] max-w-sm flex-col items-center justify-center px-4">
        <ProgressRail percent={0} indeterminate label="Loading Twitch source" className="w-full" />
        <p className="mt-4 text-sm text-text-tertiary">Loading Twitch source...</p>
      </div>
    </main>
  );
}
