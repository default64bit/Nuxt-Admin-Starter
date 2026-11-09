import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt({
  // shadcn-vue generated primitives: keep them close to upstream, so generic-parameter and prop-typing
  // idioms that trip the strict rules are tolerated here only.
  files: ["app/components/ui/**/*.{ts,vue}"],
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
});
