import SearchPageClient from "@/app/search/page.client";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Resultados de búsqueda de YouTube",
  description:
    "Explora resultados de YouTube y revisa las descargas disponibles en Phantom.",
  path: "/es/search",
  keywords: ["buscar vídeos de youtube", "resultados de youtube"],
  noIndex: true,
  locale: "es",
});

export default function SpanishSearchPage() {
  return <SearchPageClient />;
}
