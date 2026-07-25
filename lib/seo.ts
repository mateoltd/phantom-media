import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";

export const siteConfig = {
  name: "Phantom YouTube",
  shortName: "Phantom",
  description:
    "Download YouTube videos, audio, and playlists in a fast interface built for personal and authorized use.",
  creator: "mateoltd",
  publisher: "Phantom",
  keywords: [
    "youtube downloader",
    "download youtube videos",
    "youtube mp4 downloader",
    "youtube mp3 downloader",
    "youtube playlist downloader",
    "video downloader",
    "audio downloader",
    "phantom youtube",
  ],
};

export function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL);
  }

  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }

  return new URL("http://localhost:3000");
}

type RouteMetadataOptions = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
  locale?: Locale;
  languagePaths?: {
    en: string;
    es: string;
  };
};

export function buildMetadata({
  title,
  description,
  path = "/",
  keywords = [],
  noIndex = false,
  locale = "en",
  languagePaths,
}: RouteMetadataOptions): Metadata {
  const url = new URL(path, getBaseUrl()).toString();
  const imageAlt =
    locale === "es"
      ? "Phantom, descarga vídeo y audio desde tu navegador"
      : "Phantom, save video and audio from your browser";

  return {
    title,
    description,
    keywords: [...siteConfig.keywords, ...keywords],
    alternates: {
      canonical: path,
      ...(languagePaths
        ? {
            languages: {
              "en-US": languagePaths.en,
              "es-ES": languagePaths.es,
              "x-default": languagePaths.en,
            },
          }
        : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: locale === "es" ? ["en_US"] : ["es_ES"],
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1730,
          height: 909,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@mateoltd",
      images: [
        {
          url: "/og.png",
          alt: imageAlt,
        },
      ],
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
  };
}
