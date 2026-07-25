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
    default: "Phantom | Descargador de YouTube",
    template: "%s | Phantom",
  },
  description:
    "Descarga vídeos, audio y listas de YouTube desde una interfaz rápida y sencilla.",
  applicationName: siteConfig.name,
  metadataBase: getBaseUrl(),
  alternates: {
    canonical: "/es",
    languages: {
      "en-US": "/",
      "es-ES": "/es",
      "x-default": "/",
    },
  },
  openGraph: {
    title: "Phantom: Quédate con lo bueno.",
    description: "Vídeo y audio, directo a tu navegador.",
    url: "/es",
    siteName: siteConfig.name,
    locale: "es_ES",
    alternateLocale: ["en_US"],
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1730,
        height: 909,
        alt: "Phantom, descarga vídeo y audio desde tu navegador",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phantom: Quédate con lo bueno.",
    description: "Vídeo y audio, directo a tu navegador.",
    images: ["/og.png"],
  },
};

export default function SpanishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        <LocaleProvider locale="es">{children}</LocaleProvider>
      </body>
    </html>
  );
}
