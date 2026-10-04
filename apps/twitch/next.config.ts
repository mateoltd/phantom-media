import type { NextConfig } from "next";
import path from "node:path";
import { networkInterfaces } from "node:os";

const nextConfig: NextConfig = {
  allowedDevOrigins: Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).filter((address) => !address.internal && address.family === "IPv4").map((address) => address.address),
  ),
  reactCompiler: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@phantom/ui"],
  async redirects() {
    return [
      // Videos once lived at /?v=. The home page no longer reads its URL, so it can be served whole.
      {
        source: "/",
        has: [{ type: "query", key: "v", value: "(?<video>\\d+)" }],
        destination: "/videos/:video",
        permanent: true,
      },
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
