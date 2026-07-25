import WatchPageClient from "@/app/watch/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Descargar un vídeo de YouTube",
  description:
    "Consulta un vídeo de YouTube y abre sus opciones de descarga en Phantom.",
  path: "/es/watch",
  keywords: ["descargar vídeo de youtube"],
  noIndex: true,
  locale: "es",
});

export default function SpanishWatchPage() {
  return <WatchPageClient />;
}
