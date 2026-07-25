import { Suspense } from "react";
import type { Metadata } from "next";
import SearchPageClient from "@/components/search.client";

export const metadata: Metadata = {
  title: "Search",
  description: "Search films and series by title, IMDb link or TMDB id.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchPageClient />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <main className="workspace-canvas flex min-h-screen items-center justify-center">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
    </main>
  );
}
