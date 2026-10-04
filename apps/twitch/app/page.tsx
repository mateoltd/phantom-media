import { Suspense } from "react";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { HomeContent } from "@/components/HomeContent";
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
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: siteConfig.name,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          isAccessibleForFree: true,
          description: siteConfig.description,
          url: baseUrl,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      {debugEnabled && <DebugVideoScript />}
      <Suspense fallback={null}>
        <VodApp />
      </Suspense>
      <HomeContent />
    </>
  );
}
