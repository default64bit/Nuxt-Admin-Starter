// @vitest-environment node
import { fileURLToPath } from "node:url";
import { setup, fetch } from "@nuxt/test-utils/e2e";
import { expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "./support/database";

// The built server against a real throwaway database: the health probes and the `/api/v1` error platform.
dbSuite("HTTP platform and health probes", async () => {
  const database = useTestDatabase();

  await setup({
    rootDir: fileURLToPath(new URL("../..", import.meta.url)),
    server: true,
    setupTimeout: 240_000,
    nuxtConfig: {
      // The harness registered its hooks first, so the database exists by the time the server starts.
      runtimeConfig: { appEnv: "test", databaseUrl: database.url, session: { password: "test-session-password-0123456789abcdef" }, public: { siteUrl: "http://localhost:3000" } },
    },
  });

  it("answers liveness without touching the database", async () => {
    const response = await fetch("/api/health/live");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("answers readiness when the database is reachable and storage is not configured", async () => {
    const response = await fetch("/api/health/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("answers an unknown /api/v1 path with the standard JSON error body and a request id", async () => {
    const response = await fetch("/api/v1/nothing-here", { headers: { "x-request-id": "integration-test-1" } });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("integration-test-1");
    expect(await response.json()).toEqual({ statusCode: 404, statusMessage: "Not Found", data: { code: "not-found" } });
  });

  it("reports not ready, without details, once the database is gone", async () => {
    await database.drop();
    const response = await fetch("/api/health/ready");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(database.name);
  });
});
