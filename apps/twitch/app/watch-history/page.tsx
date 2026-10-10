import { WatchHistory } from "@/components/history/WatchHistory";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch history",
  description: "Twitch videos you watched in this browser, ready to resume.",
  path: "/watch-history",
  noIndex: true,
});

export default function WatchHistoryPage() {
  return <main className="workspace-canvas twitch-main">
    <WatchHistory />
  </main>;
}
