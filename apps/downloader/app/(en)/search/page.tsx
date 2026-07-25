import SearchPageClient from "@/app/search/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "YouTube Search Results",
  description:
    "Browse YouTube search results and review available downloads inside Phantom YouTube.",
  path: "/search",
  keywords: ["youtube search downloader", "youtube search results"],
  noIndex: true,
  locale: "en",
});

export default function SearchPage() {
  return <SearchPageClient />;
}
