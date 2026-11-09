import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set for Drizzle Kit commands");
}

export default defineConfig({
  dialect: "postgresql",
  casing: "snake_case",
  schema: "./server/database/schema/index.ts",
  out: "./server/database/migrations",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
