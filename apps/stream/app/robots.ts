import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Query-driven and per-title pages carry nothing worth indexing.
      disallow: ["/search", "/watch"],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
