import PlaylistPageClient from "@/app/playlist/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "YouTube Playlist Downloader",
  description:
    "Load a YouTube playlist, inspect the videos it contains, and queue authorized downloads in Phantom YouTube.",
  path: "/playlist",
  keywords: ["youtube playlist downloader", "batch video downloader"],
  noIndex: true,
  locale: "en",
});

export default function PlaylistPage() {
  return <PlaylistPageClient />;
}
