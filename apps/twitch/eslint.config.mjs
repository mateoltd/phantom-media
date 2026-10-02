import nextConfig from "@phantom/config/eslint/next";

const config = [
  { ignores: ["next-env.d.ts", ".wrangler/**"] },
  ...nextConfig,
  {
    // Imported Twitch player and chat initialize browser state in effects.
    // Their event and cleanup flow is retained while the UI is ported.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
];

export default config;
