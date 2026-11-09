import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../database/schema";

let _db: ReturnType<typeof createDb> | undefined;

function createDb() {
  const pool = new Pool({ connectionString: useRuntimeConfig().databaseUrl });
  return drizzle(pool, { schema, casing: "snake_case" });
}

export const useDb = () => (_db ??= createDb());
export { schema };
