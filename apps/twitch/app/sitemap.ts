import type { MetadataRoute } from "next";
import { FEATURED_CHANNELS } from "@/lib/discovery/featured";
import { getBaseUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();

  const staticRoutes = [
    { route: "/", changeFrequency: "daily" as const, priority: 1 },
    { route: "/videos", changeFrequency: "weekly" as const, priority: 0.8 },
    { route: "/disclaimer", changeFrequency: "yearly" as const, priority: 0.2 },
  ];

  return [
    ...staticRoutes.map(({ route, changeFrequency, priority }) => ({
      url: new URL(route, baseUrl).toString(),
      changeFrequency,
      priority,
    })),
    // Channel pages are the programmatic surface. Twitch content is volatile, so
    // they are advertised as frequently changing rather than dated.
    ...FEATURED_CHANNELS.map((channel) => ({
      url: new URL(`/${channel.login}`, baseUrl).toString(),
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
  ];
}
