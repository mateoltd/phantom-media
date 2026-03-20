import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["youtubei.js", "ws"],
  // COOP/COEP headers needed for multi-threaded ffmpeg.wasm (SharedArrayBuffer).
  // Uncomment when upgrading from single-threaded to multi-threaded mode.
  // headers: async () => [
  //   {
  //     source: "/:path*",
  //     headers: [
  //       { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  //       { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  //     ],
  //   },
  // ],
};

export default nextConfig;
