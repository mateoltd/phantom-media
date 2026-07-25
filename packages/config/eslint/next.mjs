import nextConfig from "eslint-config-next";

/**
 * Shared flat config for the Next apps. Each app appends its own `ignores`
 * entry for build output that only exists there.
 */
export const nextEslintConfig = [
  { ignores: ["node_modules/**", ".next/**", ".open-next/**"] },
  ...nextConfig,
];

export default nextEslintConfig;
