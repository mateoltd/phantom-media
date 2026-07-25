import PlaylistPageClient from "@/app/playlist/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Descargar una lista de YouTube",
  description:
    "Carga una lista de YouTube, revisa sus vídeos y prepara descargas autorizadas en Phantom.",
  path: "/es/playlist",
  keywords: ["descargar lista de youtube"],
  noIndex: true,
  locale: "es",
});

export default function SpanishPlaylistPage() {
  return <PlaylistPageClient />;
}
