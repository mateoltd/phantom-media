import nextConfig from "eslint-config-next";

export const nextEslintConfig = [
  { ignores: ["node_modules/**", ".next/**", ".open-next/**"] },
  ...nextConfig,
];

export default nextEslintConfig;
