export const siteConfig = {
  name: "Phantom Stream",
  service: "Stream",
  tagline: "Find it. Press play.",
  description:
    "Search films and series by title or IMDb link, then let Phantom find a source that actually plays.",
  creator: "mateoltd",
} as const;

export function getBaseUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return new URL(configured || "http://localhost:3000");
}
