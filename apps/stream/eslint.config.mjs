import nextConfig from "@phantom/config/eslint/next";

const config = [
  // The resolver clients and their tests are plain ESM run by node directly,
  // not by the bundler, so they are covered by `node --test` instead.
  { ignores: ["next-env.d.ts", "src/**/*.mjs", "test/**/*.mjs"] },
  ...nextConfig,
];

export default config;
