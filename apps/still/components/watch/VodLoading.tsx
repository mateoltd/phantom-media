import { StillLoader } from "../StillLoader";

/** Full-page initial loading, shared by route fallbacks and client data fetches. */
export function VodLoading({ label = "Getting your video ready…" }: { label?: string }) {
  return (
    <main className="workspace-canvas still-main still-vod-loading" aria-busy="true">
      <StillLoader label={label} variant="page" />
    </main>
  );
}
