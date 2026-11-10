// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exposeTestCode, sessionCookieSecure } from "../../../server/utils/auth-config";

describe("exposeTestCode", () => {
  const envs = ["local", "test", "staging", "production", undefined];
  const providers = ["mock", "disabled", "real-vendor", "", undefined];

  it("is true only for the dev (mock) adapter in local or test, across every combination", () => {
    for (const env of envs) {
      for (const provider of providers) {
        // An unset or blank provider is the dev adapter in local/test (the default), disabled elsewhere.
        const isMock = provider === "mock" || ((provider ?? "") === "" && (env === "local" || env === "test"));
        const expected = isMock && (env === "local" || env === "test");
        expect(exposeTestCode(env, provider), `${env} + ${provider}`).toBe(expected);
      }
    }
  });
});

describe("sessionCookieSecure", () => {
  it("is always on in staging and production, whatever the site URL", () => {
    for (const env of ["staging", "production"]) {
      expect(sessionCookieSecure(env, "https://shop.example")).toBe(true);
      expect(sessionCookieSecure(env, "http://shop.example")).toBe(true);
    }
  });

  it("is off only for local or test over plain http", () => {
    for (const env of ["local", "test"]) {
      expect(sessionCookieSecure(env, "http://localhost:3000")).toBe(false);
      expect(sessionCookieSecure(env, "")).toBe(false);
      expect(sessionCookieSecure(env, "https://localhost:3000")).toBe(true);
    }
  });
});
