import WatchPageClient from "@/app/watch/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "YouTube Video Downloader",
  description:
    "Inspect a YouTube video and open its available download options inside Phantom YouTube.",
  path: "/watch",
  keywords: ["youtube video downloader", "download youtube video"],
  noIndex: true,
  locale: "en",
});

export default function WatchPage() {
  return <WatchPageClient />;
}
