import { DebugVideoScript } from "@/components/DebugVideoScript";
import { HomeView } from "@/components/discovery/HomeView";
import { HomeContent } from "@/components/discovery/HomeContent";
import { StructuredData } from "@/components/structured-data";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: siteConfig.title,
  description: siteConfig.description,
  path: "/",
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
          sameAs: siteConfig.repositoryUrl,
          featureList: [
            "Ad-free Twitch playback",
            "Subscriber-only VOD playback when source playlists are available",
            "Live rewind and seeking through available broadcast archives",
            "No account required and no app analytics",
            "Quality, playback speed, chat and download controls",
          ],
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          isAccessibleForFree: true,
          description: siteConfig.description,
          url: baseUrl,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      {debugEnabled && <DebugVideoScript />}
      <HomeView />
      <HomeContent />
    </>
  );
}
