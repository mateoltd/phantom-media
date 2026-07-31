import nextConfig from "@phantom/config/eslint/next";

const config = [
  { ignores: ["next-env.d.ts", "src/**/*.mjs", "test/**/*.mjs"] },
  ...nextConfig,
];

export default config;
