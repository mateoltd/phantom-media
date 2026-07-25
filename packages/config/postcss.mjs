/**
 * Every app in the workspace compiles Tailwind v4 the same way.
 * @type {import('postcss-load-config').Config}
 */
export const postcssConfig = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default postcssConfig;
