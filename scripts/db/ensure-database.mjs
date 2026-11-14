import pg from "pg";

const { Client } = pg;
const targetUrlRaw = process.env.DATABASE_URL;
if (!targetUrlRaw) {
  console.error("DATABASE_URL is required to identify the target database.");
  process.exit(1);
}

const targetUrl = new URL(targetUrlRaw);
const dbName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));
const owner = decodeURIComponent(targetUrl.username);
if (!dbName || !owner) {
  console.error("DATABASE_URL must include a database name and username.");
  process.exit(1);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL is required. Database creation must use an explicit maintenance/admin connection; the application role must not create databases.");
  process.exit(1);
}
const client = new Client({ connectionString: adminUrl, application_name: "nuxt-admin-starter-db-ensure" });

try {
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount) {
    console.log(`Database ${dbName} already exists; no action needed.`);
    process.exitCode = 0;
  } else {
    // CREATE DATABASE cannot be run inside a transaction. Identifiers are separately quoted.
    try {
      await client.query(`CREATE DATABASE ${quoteIdentifier(dbName)} OWNER ${quoteIdentifier(owner)}`);
      console.log(`Created database ${dbName} with owner ${owner}.`);
    } catch (error) {
      if (error?.code === "42P04") {
        console.log(`Database ${dbName} was created concurrently; treating as complete.`);
      } else {
        throw error;
      }
    }
  }
} catch (error) {
  console.error("Could not ensure the database exists.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Confirm DATABASE_ADMIN_URL has permission to create databases and that the target role already exists.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
