import type { NextConfig } from "next";
import path from "node:path";
import { allowedDevOrigins } from "@phantom/config/dev-origins";

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOrigins(),
  reactCompiler: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@phantom/ui"],
  async redirects() {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    if (!baseUrl) return [];

    const apex = new URL(baseUrl);
    // Host conditions are regular expressions, so match hostname dots literally.
    const wwwHost = `www.${apex.hostname}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return [
      {
        source: "/",
        has: [{ type: "host", value: wwwHost }],
        destination: `${apex.origin}/`,
        permanent: true,
      },
      {
        source: "/:path+",
        has: [{ type: "host", value: wwwHost }],
        destination: `${apex.origin}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
