import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "cloudflare/worker-configuration.d.ts",
    ],
  },
  ...nextConfig,
];

export default config;
