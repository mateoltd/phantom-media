import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <div className="twitch-seo">
        <div className="media-content twitch-seo-inner">
          <header>
            <h1 className="twitch-seo-title">Page not found</h1>
            <p className="twitch-seo-lede">
              That page does not exist on Phantom Twitch. The channel may have been
              renamed or removed, or the link may be mistyped.
            </p>
          </header>
          <p className="twitch-seo-body">
            <Link href="/" className="twitch-seo-link">
              Back to the player
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
