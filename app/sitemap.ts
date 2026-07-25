import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const routes = [
    { path: "/", alternate: "/es", priority: 1, frequency: "weekly" as const },
    {
      path: "/es",
      alternate: "/",
      priority: 1,
      frequency: "weekly" as const,
    },
    {
      path: "/disclaimer",
      alternate: "/es/disclaimer",
      priority: 0.3,
      frequency: "yearly" as const,
    },
    {
      path: "/es/disclaimer",
      alternate: "/disclaimer",
      priority: 0.3,
      frequency: "yearly" as const,
    },
  ];

  return routes.map((route) => ({
    url: new URL(route.path, baseUrl).toString(),
    changeFrequency: route.frequency,
    priority: route.priority,
    alternates: {
      languages:
        route.path.startsWith("/es")
          ? {
              en: new URL(route.alternate, baseUrl).toString(),
              es: new URL(route.path, baseUrl).toString(),
            }
          : {
              en: new URL(route.path, baseUrl).toString(),
              es: new URL(route.alternate, baseUrl).toString(),
            },
    },
  }));
}
