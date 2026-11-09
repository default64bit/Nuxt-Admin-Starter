import { formatIssues, validateRuntimeConfig } from "../utils/runtime-config-schema";

// Fail fast on unsafe or missing production configuration (ADR-0014). Outside production the same
// problems are reported as a warning so local development with a partial .env keeps working.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const issues = validateRuntimeConfig(config);
  if (issues.length === 0) return;

  const report = `Invalid runtime configuration:\n${formatIssues(issues)}`;
  if (config.appEnv === "production") {
    throw new Error(report);
  }
  console.warn(`[config] ${report}`);
});
