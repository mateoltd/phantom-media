import nextConfig from "eslint-config-next";

export const libraryEslintConfig = [
  { ignores: ["node_modules/**", "dist/**"] },
  ...nextConfig.map((entry) =>
    entry.rules
      ? {
          ...entry,
          rules: {
            ...entry.rules,
            "@next/next/no-html-link-for-pages": "off",
            "@next/next/no-img-element": "off",
          },
        }
      : entry
  ),
];

export default libraryEslintConfig;
