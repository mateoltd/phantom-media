import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import { GlobalSearch } from "@/components/GlobalSearch";
import { HISTORY_HINT } from "@/lib/history-hint";
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
    default: `${siteConfig.title} | ${siteConfig.name}`,
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
    title: `${siteConfig.title} | ${siteConfig.name}`,
    description: siteConfig.description,
    url: "/",
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
    images: [siteConfig.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.title} | ${siteConfig.name}`,
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
    // HISTORY_HINT marks <html> before React starts, so its attributes are not React's to check.
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} font-sans`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: HISTORY_HINT }} />
      </head>
      <body className="font-sans antialiased">
        <GlobalSearch />
        {children}
      </body>
    </html>
  );
}
