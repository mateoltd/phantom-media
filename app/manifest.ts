import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Phantom YouTube",
    short_name: "Phantom",
    description:
      "Find YouTube media and prepare authorized video or audio downloads.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5efe3",
    theme_color: "#f5efe3",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
