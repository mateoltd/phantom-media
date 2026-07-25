import nextConfig from "@phantom/config/eslint/next";

const config = [
  { ignores: ["cloudflare/worker-configuration.d.ts"] },
  ...nextConfig,
];

export default config;
