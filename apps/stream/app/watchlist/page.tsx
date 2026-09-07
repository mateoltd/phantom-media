import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { WatchlistContent } from "@/components/watchlist.client";

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Films and series saved in your browser.",
  alternates: { canonical: "/watchlist" },
  robots: { index: false, follow: true },
};

export default function WatchlistPage() {
  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader />
      <WatchlistContent />
      <div className="app-shell mt-auto"><SiteFooter /></div>
    </main>
  );
}
