import pg from "pg";

const { Client } = pg;

// Provisions GlitchTip's own role and logical database on the shared PostgreSQL (ADR-0015). Idempotent; the
// application database and role are never touched.
const adminUrl = process.env.DATABASE_ADMIN_URL;
const databaseName = process.env.GLITCHTIP_DB_NAME ?? "glitchtip";
const roleName = process.env.GLITCHTIP_DB_USER ?? "glitchtip_app";
const rolePassword = process.env.GLITCHTIP_DB_PASSWORD;
const appDatabaseName = process.env.POSTGRES_DB ?? "app";

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is required for monitoring database provisioning");
if (!rolePassword || rolePassword.length < 24 || !/^[a-zA-Z0-9_-]+$/.test(rolePassword)) {
  throw new Error("GLITCHTIP_DB_PASSWORD must be a generated URL-safe secret of at least 24 characters");
}
if (databaseName === appDatabaseName) {
  throw new Error("GlitchTip MUST use a separate logical database from the application");
}

const admin = new Client({ connectionString: adminUrl, application_name: "nuxt-admin-starter-monitoring-db-ensure" });
const dbIdent = quoteIdentifier(databaseName);
const roleIdent = quoteIdentifier(roleName);

try {
  await admin.connect();

  const roleResult = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [roleName]);
  if (roleResult.rowCount === 0) {
    await admin.query(`CREATE ROLE ${roleIdent} LOGIN PASSWORD ${quoteLiteral(rolePassword)}`);
  } else {
    // Keep the configured role password in sync; the password is URL-safe by validation above.
    await admin.query(`ALTER ROLE ${roleIdent} LOGIN PASSWORD ${quoteLiteral(rolePassword)}`);
  }

  const dbResult = await admin.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1", [databaseName]);
  if (dbResult.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${dbIdent} OWNER ${roleIdent}`);
  } else if (dbResult.rows[0].owner !== roleName) {
    throw new Error(`Database ${databaseName} already exists but is owned by ${dbResult.rows[0].owner}; review/repair ownership manually rather than changing it silently`);
  }

  console.info(JSON.stringify({ event: "monitoring_database_ready", database: databaseName, role: roleName }));
} finally {
  await admin.end().catch(() => {});
}
