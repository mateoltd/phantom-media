import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@phantom/ui"],
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "www.notwitch.tv" }],
        destination: "https://notwitch.tv/",
        permanent: true,
      },
      {
        source: "/:path+",
        has: [{ type: "host", value: "www.notwitch.tv" }],
        destination: "https://notwitch.tv/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
