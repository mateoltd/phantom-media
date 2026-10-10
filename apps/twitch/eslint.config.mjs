import nextConfig from "@phantom/config/eslint/next";

const config = [
  { ignores: ["next-env.d.ts", ".wrangler/**"] },
  ...nextConfig,
  {
    // Browser hooks synchronize media and external resources in effects.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/lib/twitch/*", "@/lib/playback/resolve", "@/lib/playback/current-archive", "@/lib/playback/clips", "@/lib/playback/attributes", "@/lib/media/proxy", "@/lib/media/presentation", "@/lib/media/manifest", "@/lib/media/destination"] }],
    },
  },
];

export default config;
