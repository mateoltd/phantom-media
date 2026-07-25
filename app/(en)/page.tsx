import HomePageClient from "@/app/home.client";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "YouTube Downloader for Video, Audio, and Playlists",
  description:
    "Download YouTube videos, playlists, and audio in a fast interface with queueing, format choices, and personal-use guidance.",
  path: "/",
  keywords: [
    "download youtube videos online",
    "youtube audio downloader",
    "youtube playlist download tool",
  ],
  locale: "en",
  languagePaths: {
    en: "/",
    es: "/es",
  },
});

export default function Home() {
  const baseUrl = getBaseUrl().toString();

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: baseUrl,
          inLanguage: "en-US",
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
          inLanguage: "en-US",
          description: siteConfig.description,
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
      <HomePageClient />
    </>
  );
}
