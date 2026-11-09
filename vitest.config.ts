import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    include: [
      "tests/unit/**/*.{test,spec}.ts",
      "tests/components/**/*.{test,spec}.ts",
      "tests/integration/**/*.{test,spec}.ts",
      // starter-meta:start
      "tests/starter/**/*.{test,spec}.ts",
      // starter-meta:end
    ],
    environment: "nuxt",
    environmentOptions: {
      nuxt: { domEnvironment: "happy-dom" },
    },
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10_000,
    // Locally, leave half the cores free so the machine stays usable and the suites sharing one PostgreSQL do not
    // starve each other into hook timeouts. CI keeps Vitest's default. Override per run with `--maxWorkers`.
    maxWorkers: process.env.CI ? undefined : "50%",
  },
});
