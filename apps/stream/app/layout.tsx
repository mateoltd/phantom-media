import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteMotion } from "@/components/route-motion";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";
import "./motion.css";
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
    default: `${siteConfig.name}: ${siteConfig.tagline}`,
    template: `%s from ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  creator: siteConfig.creator,
  metadataBase: getBaseUrl(),
  alternates: { canonical: "/" },
  openGraph: {
    title: `${siteConfig.name}: ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: "/",
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1730,
        height: 909,
        alt: `${siteConfig.name}: ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name}: ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const localDebug =
    process.env.NODE_ENV !== "production" && process.env.DEBUG === "1";

  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} font-sans`}
    >
      <head>
        {localDebug ? <meta name="phantom-debug" content="1" /> : null}
      </head>
      <body>
        <Suspense fallback={null}><RouteMotion /></Suspense>
        {children}
      </body>
    </html>
  );
}
