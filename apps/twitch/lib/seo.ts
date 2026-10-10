import type { Metadata } from "next";

export const siteConfig = {
  name: "Still",
  shortName: "Still",
  title: "Ad-Free Twitch Player, Subscriber-Only VODs & Live Rewind",
  repositoryUrl: "https://github.com/mateoltd/phantom-media",
  description:
    "Watch Twitch ad-free without an account. Play subscriber-only VODs, rewind live streams through available archives, and take control with no app analytics.",
  creator: "mateoltd",
  publisher: "Phantom Media",
  ogImage: {
    url: "/og.png",
    width: 1200,
    height: 630,
    alt: "Still - ad-free Twitch player, subscriber-only VODs and live rewind",
  },
  keywords: [
    "twitch client",
    "watch twitch live",
    "watch twitch vods",
    "twitch vod player",
    "still twitch player",
    "ad free twitch player",
    "twitch without account",
    "twitch live rewind",
    "twitch dvr",
    "twitch alternative client",
    "subscriber only twitch vods",
    "twitch restricted vods",
    "twitch vod downloader",
    "sub-only vod bypass",
    "download twitch vods",
    "twitch vod download",
    "save twitch vods",
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

/**
 * Paths that must never resolve to a Twitch channel. Static segments win over
 * the `[channelName]` dynamic segment on their own, but this list keeps the
 * channel route from claiming app-owned words if a route is ever renamed.
 */
export const reservedChannelNames = new Set([
  "api",
  "disclaimer",
  "favicon.ico",
  "icon.png",
  "apple-icon.png",
  "manifest.webmanifest",
  "og.png",
  "robots.txt",
  "sitemap.xml",
  "videos",
  "categories",
  "live-wall",
]);

export function isReservedChannelName(value: string): boolean {
  const name = value.trim().toLowerCase();

  if (!name) return true;
  if (reservedChannelNames.has(name)) return true;
  // Anything that looks like a file or an asset path is never a channel.
  if (name.includes(".")) return true;

  return false;
}

type RouteImage = {
  url: string;
  width?: number;
  height?: number;
  alt: string;
};

type RouteMetadataOptions = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
  /** Defaults to the site-wide OG card. */
  image?: string | RouteImage;
  imageAlt?: string;
  type?: "website" | "profile" | "video.other";
};

function resolveImage(image: string | RouteImage | undefined, alt: string | undefined): RouteImage {
  if (typeof image === "string") {
    return { url: image, width: siteConfig.ogImage.width, height: siteConfig.ogImage.height, alt: alt ?? siteConfig.ogImage.alt };
  }

  if (image) return { ...image, alt: image.alt || alt || siteConfig.ogImage.alt };

  return { ...siteConfig.ogImage, alt: alt ?? siteConfig.ogImage.alt };
}

function buildRobots(noIndex: boolean): Metadata["robots"] {
  const index = !noIndex;

  return {
    index,
    follow: true,
    googleBot: {
      index,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  };
}

export function buildMetadata({
  title,
  description,
  path = "/",
  keywords = [],
  noIndex = false,
  image,
  imageAlt,
  type = "website",
}: RouteMetadataOptions): Metadata {
  const url = new URL(path, getBaseUrl()).toString();
  const socialImage = resolveImage(image, imageAlt);

  return {
    title,
    description,
    keywords: [...siteConfig.keywords, ...keywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      locale: "en_US",
      type,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@mateoltd",
      images: [socialImage.url],
    },
    robots: buildRobots(noIndex),
  };
}
