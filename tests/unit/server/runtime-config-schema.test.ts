// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatIssues, isStorageConfigured, validateRuntimeConfig } from "../../../server/utils/runtime-config-schema";

const valid = (overrides: Record<string, unknown> = {}) => ({
  appEnv: "production",
  databaseUrl: "postgresql://app:s3cretValue@postgres:5432/app",
  session: { password: randomBytes(24).toString("hex") },
  ipHashSecret: randomBytes(24).toString("hex"),
  s3: { endpoint: "", region: "us-east-1", accessKey: "", secretKey: "", privateBucket: "", publicBucket: "" },
  public: { siteUrl: "https://admin.test.ir" },
  ...overrides,
});

const paths = (config: Record<string, unknown>) => validateRuntimeConfig(config).map((issue) => issue.path);

describe("validateRuntimeConfig", () => {
  it("accepts a production configuration with only the required keys", () => {
    expect(validateRuntimeConfig(valid())).toEqual([]);
  });

  it("never requires storage, Channel or monitoring keys", () => {
    const bare = valid();
    // Not even the sections exist: an Optional piece that is Off adds nothing to the configuration.
    expect(validateRuntimeConfig({ ...bare, s3: undefined })).toEqual([]);
    expect(validateRuntimeConfig({ ...bare, telegram: undefined, vapid: undefined, glitchtipServerDsn: undefined })).toEqual([]);
  });

  it("reports every missing or short required key by name", () => {
    const issues = paths(valid({ databaseUrl: "", session: { password: "short" }, ipHashSecret: "", public: { siteUrl: "" } }));
    expect(new Set(issues)).toEqual(new Set(["databaseUrl", "session.password", "ipHashSecret", "public.siteUrl"]));
  });

  it("flags an unknown environment flag and a non-Postgres URL", () => {
    expect(paths(valid({ appEnv: "prod" }))).toEqual(["appEnv"]);
    expect(paths(valid({ databaseUrl: "mysql://db/app" }))).toEqual(["databaseUrl"]);
  });

  it("treats storage as all-or-nothing", () => {
    const s3 = { endpoint: "http://storage:9000", region: "us-east-1", accessKey: "key", secretKey: "secret", privateBucket: "private", publicBucket: "public" };
    expect(validateRuntimeConfig(valid({ s3 }))).toEqual([]);
    expect(isStorageConfigured(s3)).toBe(true);
    expect(isStorageConfigured(valid().s3)).toBe(false);
    expect(paths(valid({ s3: { ...s3, secretKey: "", publicBucket: " " } }))).toEqual(["s3.secretKey", "s3.publicBucket"]);
  });

  it("rejects .env.example placeholders only in production", () => {
    const placeholder = { session: { password: "change-me-to-a-random-secret-of-at-least-32-characters" } };
    expect(paths(valid(placeholder))).toEqual(["session.password"]);
    expect(validateRuntimeConfig(valid({ ...placeholder, appEnv: "local" }))).toEqual([]);
  });

  it("never echoes configured values in its report", () => {
    const secretValue = "replace-with-super-secret-value-0123456789abcdef";
    const report = formatIssues(validateRuntimeConfig(valid({ session: { password: secretValue } })));
    expect(report).toContain("session.password");
    expect(report).not.toContain(secretValue);
  });
});
