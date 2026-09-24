import { Suspense } from "react";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { StructuredData } from "@/components/structured-data";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Twitch Live and VOD Client",
  description:
    "Search Twitch channels, watch live streams, browse recent VODs, and resume video playback in a modern web player.",
  path: "/",
  keywords: [
    "twitch client",
    "watch twitch live",
    "watch twitch vods",
    "twitch channel search",
    "twitch vod player",
  ],
});

export default function Home() {
  const baseUrl = getBaseUrl().toString();
  const debugEnabled = isDebugEnabled();

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: baseUrl,
          description: siteConfig.description,
          potentialAction: {
            "@type": "SearchAction",
            target: `${baseUrl}?v={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: siteConfig.name,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          description: siteConfig.description,
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What can Phantom Twitch do?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Phantom Twitch lets you search Twitch channels, watch live streams, browse recent VODs, and play Twitch videos in a modern adaptive web player.",
              },
            },
            {
              "@type": "Question",
              name: "Which video formats are supported?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Phantom Twitch supports HLS adaptive streaming with multiple quality options including 1080p60, 720p60, 480p, 360p, and 160p, with both H.264 and H.265 codec support where available.",
              },
            },
            {
              "@type": "Question",
              name: "Is Phantom Twitch affiliated with Twitch?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Phantom Twitch is an independent tool and is not endorsed by or affiliated with Twitch or Amazon.",
              },
            },
          ],
        }}
      />
      {debugEnabled && <DebugVideoScript />}
      <Suspense>
        <VodApp />
      </Suspense>
    </>
  );
}
