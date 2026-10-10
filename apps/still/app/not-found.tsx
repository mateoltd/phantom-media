import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <div className="still-seo">
        <div className="media-content still-seo-inner">
          <header>
            <h1 className="still-seo-title">Page not found</h1>
            <p className="still-seo-lede">
              That page does not exist on Still. The channel may have been
              renamed or removed, or the link may be mistyped.
            </p>
          </header>
          <p className="still-seo-body">
            <Link href="/" className="still-seo-link">
              Back to the player
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
