#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_DB_USER:?APP_DB_USER must be set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"

psql --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  --set=app_user="${APP_DB_USER}" \
  --set=app_password="${APP_DB_PASSWORD}" \
  --set=db_name="${POSTGRES_DB}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
ALTER DATABASE :"db_name" OWNER TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
SQL
