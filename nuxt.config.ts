import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  // A second server on the same checkout (a throwaway test database, a parallel e2e shard) must not
  // share the first one's build directory or build output, so it names its own.
  ...(process.env.E2E_BUILD_DIR ? { buildDir: process.env.E2E_BUILD_DIR, nitro: { output: { dir: `${process.env.E2E_BUILD_DIR}/output` } } } : {}),
  devtools: { enabled: false },

  // Site-wide icons. The files are static and committed under `public/` (see the theming guide).
  app: {
    head: {
      link: [
        { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        { rel: "icon", type: "image/png", href: "/favicon-32.png", sizes: "32x32" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon-180.png", sizes: "180x180" },
      ],
    },
  },

  css: ["~/assets/css/tailwind.css"],

  // Git worktrees live under `.claude/worktrees/` inside the checkout, each with its own nuxt.config, .env,
  // .nuxt and node_modules. Without this the dev server scans and watches them and can restart whenever one
  // is created.
  ignore: [".claude/**"],
  vite: {
    plugins: [tailwindcss()],
    server: { watch: { ignored: ["**/.claude/**"] } },
    // Pre-bundled so the dev server does not reload the page when it first meets them.
    optimizeDeps: { include: ["@vueuse/core", "reka-ui", "vue-sonner"] },
  },

  modules: ["@nuxt/a11y", "@nuxt/eslint", "@nuxtjs/color-mode", "@nuxtjs/i18n", "@pinia/nuxt", "shadcn-nuxt"],

  // Light/dark is owned by @nuxtjs/color-mode alone: a static pre-paint script reads localStorage and
  // sets `dark` on <html> before first paint. No cookie, so cached HTML never varies per visitor.
  colorMode: {
    classSuffix: "",
    preference: "system",
    fallback: "light",
    storage: "localStorage",
    storageKey: "color-mode",
  },

  shadcn: {
    prefix: "",
    componentDir: "@/components/ui",
  },

  // `fa` (RTL) is the default locale. To change the default, change `defaultLocale` here and
  // `locale` in `i18n/i18n.config.ts`. The URL is the only source of the active language.
  i18n: {
    defaultLocale: "fa",
    strategy: "prefix_except_default",
    locales: [
      {
        code: "fa",
        language: "fa-IR",
        name: "فارسی",
        dir: "rtl",
        file: "fa.json",
      },
      {
        code: "en",
        language: "en",
        name: "English",
        dir: "ltr",
        file: "en.json",
      },
    ],
    langDir: "locales",
    detectBrowserLanguage: false,
  },
});
