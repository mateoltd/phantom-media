import HomePageClient from "@/app/home.client";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

const description =
  "Descarga vídeos, audio y listas de YouTube desde el navegador, con selección de formato y progreso real.";

export const metadata = buildMetadata({
  title: "Descargar vídeos y audio de YouTube",
  description,
  path: "/es",
  locale: "es",
  languagePaths: {
    en: "/",
    es: "/es",
  },
  keywords: [
    "descargar vídeos de youtube",
    "descargar audio de youtube",
    "descargar listas de youtube",
    "descargador youtube online",
  ],
});

export default function SpanishHome() {
  const pageUrl = new URL("/es", getBaseUrl()).toString();

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: pageUrl,
          inLanguage: "es-ES",
          description,
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
          inLanguage: "es-ES",
          description,
          url: pageUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
          },
        }}
      />
      <HomePageClient />
    </>
  );
}
