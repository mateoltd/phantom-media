import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const routes = ["/", "/disclaimer"];

  return routes.map((route) => ({
    url: new URL(route, baseUrl).toString(),
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "yearly",
    priority: route === "/" ? 1 : 0.3,
  }));
}
