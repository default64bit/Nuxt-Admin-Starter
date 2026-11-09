import { z } from "zod";

// Startup validation of server runtime configuration (ADR-0014). Pure and side-effect free so it can
// be unit tested; `server/plugins/validate-env.ts` decides whether issues are fatal. Issue messages
// name the failing key only and never echo a configured value.
//
// Only the keys the app cannot run without are required. Optional pieces (object storage, Channels,
// error tracking) read as "not configured" while their keys are empty and never produce an issue. A
// slice that adds a required key adds it to this schema, to `nuxt.config.ts` and to `.env.example`.

// Placeholder markers from `.env.example`: valid for local development, never for production.
const PLACEHOLDER_PATTERN = /change-me|replace-with|example\.com/i;

const nonEmpty = z.string().trim().min(1, "is required");
const secret = nonEmpty.min(32, "must be at least 32 characters");
const url = nonEmpty.url("must be a valid URL");

export const runtimeConfigSchema = z.object({
  appEnv: z.enum(["local", "test", "staging", "production"]),
  databaseUrl: nonEmpty.regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  session: z.object({ password: secret }),
  public: z.object({ siteUrl: url }),
});

export type RuntimeConfigIssue = { path: string; message: string };

/** The keys of the private object storage, which is configured as a whole or not at all. */
const STORAGE_KEYS = ["endpoint", "accessKey", "secretKey", "privateBucket", "publicBucket"] as const;

function stringLeaves(value: unknown, prefix: string[] = []): { path: string[]; value: string }[] {
  if (typeof value === "string") return [{ path: prefix, value }];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => stringLeaves(child, [...prefix, key]));
  }
  return [];
}

const isSet = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** Whether private object storage is configured (its endpoint and credentials are all set). */
export function isStorageConfigured(s3: unknown): boolean {
  const value = (s3 ?? {}) as Record<string, unknown>;
  return STORAGE_KEYS.every((key) => isSet(value[key]));
}

/** Storage that is only partly set is a mistake worth reporting; storage that is wholly empty is simply Off. */
function validateStorage(config: unknown): RuntimeConfigIssue[] {
  const s3 = ((config ?? {}) as { s3?: Record<string, unknown> }).s3 ?? {};
  const set = STORAGE_KEYS.filter((key) => isSet(s3[key]));
  if (set.length === 0 || set.length === STORAGE_KEYS.length) return [];
  return STORAGE_KEYS.filter((key) => !isSet(s3[key])).map((key) => ({ path: `s3.${key}`, message: "is required when other object storage keys are set" }));
}

export function validateRuntimeConfig(config: unknown): RuntimeConfigIssue[] {
  const parsed = runtimeConfigSchema.safeParse(config);
  const issues: RuntimeConfigIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

  issues.push(...validateStorage(config));

  const appEnv = (config as { appEnv?: unknown } | null)?.appEnv;
  if (appEnv === "production") {
    for (const leaf of stringLeaves(config)) {
      if (PLACEHOLDER_PATTERN.test(leaf.value)) {
        issues.push({
          path: leaf.path.join("."),
          message: "still contains a placeholder value; production needs a real value",
        });
      }
    }
  }
  return issues;
}

export function formatIssues(issues: RuntimeConfigIssue[]): string {
  return issues.map((issue) => `  - ${issue.path || "(root)"}: ${issue.message}`).join("\n");
}
