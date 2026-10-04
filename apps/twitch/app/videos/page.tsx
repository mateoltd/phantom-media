import Link from "next/link";
import { StructuredData } from "@/components/structured-data";
import { FEATURED_CHANNELS } from "@/lib/featured-channels";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch Twitch VODs and Past Broadcasts",
  description:
    "Browse Twitch VODs and past broadcasts. Open any channel to watch live streams and replay recent broadcasts in the Phantom Twitch player.",
  path: "/videos",
  keywords: [
    "watch twitch vods",
    "twitch past broadcasts",
    "twitch vod player",
    "twitch replay",
  ],
});

export default function VideosPage() {
  const pageUrl = new URL("/videos", getBaseUrl()).toString();

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Twitch VODs and Past Broadcasts",
          description:
            "Browse Twitch VODs and past broadcasts on Phantom Twitch.",
          url: pageUrl,
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: getBaseUrl().toString() },
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: getBaseUrl().toString(),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "VODs",
              item: pageUrl,
            },
          ],
        }}
      />

      <main className="min-h-screen">
        <div className="twitch-seo">
          <div className="media-content twitch-seo-inner">
            <header>
              <h1 className="twitch-seo-title">Twitch VODs and past broadcasts</h1>
              <p className="twitch-seo-lede">
                Every Phantom Twitch channel page lists that channel&apos;s recent
                broadcasts and past broadcasts. Open a channel to play its VODs in
                the adaptive player, with chat and playback memory alongside.
              </p>
            </header>

            <div className="twitch-seo-block">
              <h2 className="twitch-seo-subheading">Browse by channel</h2>
              <ul className="twitch-seo-links">
                {FEATURED_CHANNELS.map((channel) => (
                  <li key={channel.login}>
                    <Link href={`/${channel.login}`} className="twitch-seo-link">
                      {channel.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <p className="twitch-seo-body">
              <Link href="/" className="twitch-seo-link">
                Back to the player
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
