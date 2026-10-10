import Link from "next/link";
import { StructuredData } from "@/components/structured-data";
import { FEATURED_CHANNELS } from "@/lib/discovery/featured";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch Twitch VODs, Including Subscriber-Only Broadcasts",
  description:
    "Watch Twitch VODs and available subscriber-only broadcasts without an account. Seek, change playback speed, replay chat, resume, or download in Still.",
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
            "Browse Twitch VODs and past broadcasts on Still.",
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
        <div className="still-seo">
          <div className="media-content still-seo-inner">
            <header>
              <h1 className="still-seo-title">Twitch VODs and subscriber-only broadcasts</h1>
              <p className="still-seo-lede">
                Watch past Twitch broadcasts, including subscriber-only VODs when
                their source playlists are available, without signing in. Search
                for a channel or paste a Twitch VOD link into the player. Choose
                your quality and playback speed, seek through the broadcast,
                follow chat replay, or download the video.
              </p>
            </header>

            <div className="still-seo-block">
              <h2 className="still-seo-subheading">Browse by channel</h2>
              <ul className="still-seo-links">
                {FEATURED_CHANNELS.map((channel) => (
                  <li key={channel.login}>
                    <Link href={`/${channel.login}`} className="still-seo-link">
                      {channel.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <p className="still-seo-body">
              <Link href="/" className="still-seo-link">
                Back to the player
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
