import nextConfig from "eslint-config-next";

/**
 * The UI package is plain React compiled by whichever app imports it, so it is
 * linted with the same rules as the apps minus the routing-only checks that
 * need a Next project root.
 */
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
