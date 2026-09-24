import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@phantom/ui"],
};

export default nextConfig;
