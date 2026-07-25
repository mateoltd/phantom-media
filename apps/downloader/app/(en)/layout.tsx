import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "../globals.css";
import { LocaleProvider } from "@/components/locale-provider";
import { getBaseUrl, siteConfig } from "@/lib/seo";

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
    default: "Phantom YouTube | YouTube Downloader",
    template: "%s | Phantom YouTube",
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
    languages: {
      "en-US": "/",
      "es-ES": "/es",
      "x-default": "/",
    },
  },
  openGraph: {
    title: "Phantom: Keep the good stuff.",
    description: "Fast, web-only video and audio downloads. Nothing to install.",
    url: "/",
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1730,
        height: 909,
        alt: "Phantom: Keep the good stuff.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phantom: Keep the good stuff.",
    description: "Fast, web-only video and audio downloads. Nothing to install.",
    creator: "@mateoltd",
    images: ["/og.png"],
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

export default function EnglishLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        <LocaleProvider locale="en">{children}</LocaleProvider>
      </body>
    </html>
  );
}
