import path from "node:path";
import type { NextConfig } from "next";
import { allowedDevOrigins } from "@phantom/config/dev-origins";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  process.env.NODE_ENV === "development"
    ? "connect-src 'self' http: https: ws: wss:"
    : "connect-src 'self' https:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOrigins(),
  distDir: process.env.PHANTOM_NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@phantom/ui"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.metahub.space" },
      { protocol: "https", hostname: "episodes.metahub.space" },
      { protocol: "https", hostname: "m.media-amazon.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/watch", destination: "/", permanent: false, missing: [{ type: "query", key: "id" }] },
      { source: "/search", destination: "/", permanent: false, missing: [{ type: "query", key: "q" }] },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
