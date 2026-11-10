import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { buildRouteRules } from "./shared/utils/route-rules";

// A locale's message files: `<code>.json` plus every feature file `<feature>.<code>.json` beside it (for example
// `demo-ticket.fa.json`), merged at load. Removing a feature means deleting its message files; nothing here changes.
const localeFiles = (code: string): string[] => [
  `${code}.json`,
  ...readdirSync(fileURLToPath(new URL("./i18n/locales", import.meta.url)))
    .filter((name) => name.endsWith(`.${code}.json`))
    .sort(),
];

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
    // Errors only: drop the Sentry SDK's tracing code from the bundles.
    define: { __SENTRY_TRACING__: false },
    // Pre-bundled so the dev server does not reload the page when it first meets them.
    optimizeDeps: { include: ["@vueuse/core", "reka-ui", "vue-sonner"] },
  },

  modules: ["@nuxt/a11y", "@nuxt/eslint", "@nuxtjs/color-mode", "@nuxtjs/i18n", "@pinia/nuxt", "@sentry/nuxt/module", "nuxt-auth-utils", "nuxt-security", "shadcn-nuxt"],

  // GlitchTip error capture (an Optional piece, ADR-0015): server and browser errors only. The SDK is initialised in
  // `sentry.{server,client}.config.ts` and only when a DSN is set. Source-map upload, build-time instrumentation
  // and tracing are off; tracing's browser integration is compiled out below.
  sentry: {
    // Vitest loads this config for its Nuxt environment, where the module would only write build output that is not there.
    ...(process.env.VITEST ? { enabled: false } : {}),
    sourcemaps: { disable: true },
    telemetry: false,
    buildTimeInstrumentation: false,
  },

  // Light/dark is owned by @nuxtjs/color-mode alone: a static pre-paint script reads localStorage and
  // sets `dark` on <html> before first paint. No cookie, so cached HTML never varies per visitor.
  colorMode: {
    classSuffix: "",
    preference: "system",
    fallback: "light",
    storage: "localStorage",
    storageKey: "color-mode",
  },

  // Rendering and cache policy per page class, mirrored for `/en/` (ADR-0013): the landing page is
  // shared-cached; sign-in and `/admin/**` are uncached, `private, no-store` and `noindex`.
  routeRules: {
    ...buildRouteRules(),
    // The module's coarse per-IP route limiter is off so ordinary page loads and assets are never
    // throttled. A route that needs a limit (the OTP endpoints) opts in with its own rule.
    "/**": { security: { rateLimiter: false } },
    // The coarse per-IP route limiter applies to the OTP endpoints only; the per-phone and per-IP rolling send
    // limits live in the auth service. The session read and logout are never throttled.
    "/api/v1/auth/otp/**": { security: { rateLimiter: { tokensPerInterval: 20, interval: 60_000 } } },
  },

  // Token CSRF is off: it cannot work on shared-cached pages. `server/middleware/10.csrf.ts` guards
  // state-changing `/api/v1` requests by origin instead (ADR-0023). The CSP is built from content hashes
  // by `server/plugins/csp.ts` (ADR-0022), so the module's per-request nonce and its own CSP header are off.
  security: {
    csrf: false,
    nonce: false,
    headers: {
      contentSecurityPolicy: false,
    },
  },

  hooks: {
    // Put the standard `/api/v1` error body (ADR-0015) in front of Nuxt's own error renderer, which
    // keeps answering every non-API request. Setting `nitro.errorHandler` directly would replace it.
    "nitro:config"(nitroConfig) {
      // Drop nuxt-auth-utils' own session routes; `server/api/_auth/session.*` answers 404 instead.
      nitroConfig.handlers = (nitroConfig.handlers ?? []).filter((handler) => handler?.route !== "/api/_auth/session");
      const apiHandler = fileURLToPath(new URL("./server/error-handler.ts", import.meta.url));
      const existing = nitroConfig.errorHandler;
      nitroConfig.errorHandler = [apiHandler, ...(Array.isArray(existing) ? existing : existing ? [existing] : [])];
    },
  },

  // nuxt-auth-utils only seals the cookie; the own `GET /api/v1/auth/session` and `useAuthSession()` replace its
  // client plugins and server routes (ADR-0010).
  auth: {
    loadStrategy: "none",
  },

  // Private values are supplied by `NUXT_*` variables at runtime (ADR-0014); `server/utils/runtime-config-schema.ts`
  // validates them at boot. Optional pieces read as "not configured" while their keys are empty.
  runtimeConfig: {
    // Explicit environment flag (local | test | staging | production); not derived from NODE_ENV.
    appEnv: "local",
    databaseUrl: "",
    // Server-side error-capture DSN (an Optional piece); empty falls back to `public.glitchtipDsn`. May use the
    // internal `glitchtip` host.
    glitchtipServerDsn: "",
    session: {
      password: "",
    },
    // Keys the HMAC of caller IPs kept for the OTP send limits.
    ipHashSecret: "",
    sms: {
      // Blank = the mock adapter in local/test, disabled elsewhere; see effectiveSmsProvider.
      provider: "",
      // Explicit, temporary opt-in (NUXT_SMS_ALLOW_MOCK_IN_PRODUCTION=true) to run `mock` in production.
      allowMockInProduction: false,
      // The only template slots: the sign-in code, per locale (NUXT_SMS_TEMPLATE_OTP_FA / _EN), used by the Kavenegar adapter.
      template: { otp: { fa: "", en: "" } },
    },
    kavenegar: {
      // Server-only secret, needed when NUXT_SMS_PROVIDER=kavenegar (NUXT_KAVENEGAR_API_KEY); never logged.
      apiKey: "",
      // Per-call HTTP timeout (NUXT_KAVENEGAR_TIMEOUT_MS, 1000-60000 ms); a send is never retried.
      timeoutMs: 10000,
    },
    // Private object storage. Empty means not configured: readiness skips it and boot never fails.
    s3: {
      endpoint: "",
      region: "us-east-1",
      accessKey: "",
      secretKey: "",
      privateBucket: "",
      publicBucket: "",
    },
    public: {
      siteUrl: "",
      // Optional pieces: empty means not configured. The media origin joins the CSP image sources and
      // the error-tracking DSN adds its origin and report endpoint (ADR-0022).
      mediaBaseUrl: "",
      glitchtipDsn: "",
    },
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
        files: localeFiles("fa"),
      },
      {
        code: "en",
        language: "en",
        name: "English",
        dir: "ltr",
        files: localeFiles("en"),
      },
    ],
    langDir: "locales",
    detectBrowserLanguage: false,
  },
});
