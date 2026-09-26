import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import { GlobalSearch } from "@/components/GlobalSearch";
import { getBaseUrl, siteConfig } from "@/lib/seo";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Phantom Twitch - Twitch Live and VOD Client",
    template: "%s | Phantom Twitch",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: siteConfig.keywords,
  authors: [{ name: "mateoltd", url: "https://github.com/mateoltd" }],
  creator: siteConfig.creator,
  publisher: siteConfig.publisher,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: getBaseUrl(),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Phantom Twitch - Twitch Live and VOD Client",
    description: siteConfig.description,
    url: "/",
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
    images: [siteConfig.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phantom Twitch - Twitch Live and VOD Client",
    description: siteConfig.description,
    creator: "@mateoltd",
    images: [siteConfig.ogImage.url],
  },
  robots: {
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} font-sans`}
    >
      <body className="font-sans antialiased">
        <GlobalSearch />
        {children}
      </body>
    </html>
  );
}
