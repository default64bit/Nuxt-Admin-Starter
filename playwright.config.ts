import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
// The server Playwright starts for itself is its own, never the developer's: it listens on its own port and
// writes its own build directory (`.nuxt-e2e`, ignored by git). A `nuxt dev` already running on the checkout
// (the Compose `app` service on port 3000) keeps its `.nuxt` and is neither reused nor overwritten. Set
// PLAYWRIGHT_BASE_URL to test an already running server instead.
const e2ePort = Number(process.env.E2E_PORT ?? 3100);
const e2eBuildDir = process.env.E2E_BUILD_DIR ?? ".nuxt-e2e";
const baseURL = externalBaseUrl || `http://127.0.0.1:${e2ePort}`;
// Specs that build absolute URLs read this too (they fall back to port 3000 otherwise).
process.env.PLAYWRIGHT_BASE_URL = baseURL;
// Firefox and WebKit run only the tests tagged `@cross-browser`, and only when asked: `just test-e2e-cross-browser`
// installs them and sets this, and so does the CI job that runs them.
const crossBrowser = Boolean(process.env.CROSS_BROWSER);

export default defineConfig({
  testDir: "./tests/e2e",
  // Specs share one database (a few fixed phone numbers), so they run one at a time. Parallelism comes from
  // sharding (`scripts/e2e/sharded.mjs`), where every shard has its own database and server.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(crossBrowser
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: /@cross-browser/ },
          { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@cross-browser/ },
        ]
      : []),
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `corepack pnpm dev --host 127.0.0.1 --port ${e2ePort}`,
        url: `${baseURL}/api/health/live`,
        // Sign-in is tested end to end with the mock SMS adapter (test mode fills the code). The site URL is this
        // server's own origin, which the request-origin (CSRF) guard compares against. `@nuxt/a11y` logs contrast
        // "violations" to the console while a reveal transition is mid-fade; real violations are asserted by the
        // axe checks in the specs, so the dev-time console logging is off for the e2e server.
        env: {
          NUXT_PUBLIC_A11Y_LOG_ISSUES: "false",
          NUXT_SMS_PROVIDER: "mock",
          NUXT_APP_ENV: "local",
          E2E_BUILD_DIR: e2eBuildDir,
          NUXT_PUBLIC_SITE_URL: baseURL,
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
