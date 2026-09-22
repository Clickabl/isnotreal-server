#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_URL:?Set PG_ADMIN_URL}"
: "${ISNOTREAL_OWNER_PASSWORD:?Set ISNOTREAL_OWNER_PASSWORD}"
: "${ISNOTREAL_APP_PASSWORD:?Set ISNOTREAL_APP_PASSWORD}"
: "${ISNOTREAL_EDITOR_PASSWORD:?Set ISNOTREAL_EDITOR_PASSWORD}"
: "${ISNOTREAL_PUBLISHER_PASSWORD:?Set ISNOTREAL_PUBLISHER_PASSWORD}"
DB="${ISNOTREAL_DB_NAME:-isnotreal}"
OWNER="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"
APP="${ISNOTREAL_APP_ROLE:-isnotreal_app}"
EDITOR="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
PUBLISHER="${ISNOTREAL_PUBLISHER_ROLE:-isnotreal_publisher}"
for name in "$DB" "$OWNER" "$APP" "$EDITOR" "$PUBLISHER"; do
  [[ "$name" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo 'Invalid database/role identifier' >&2; exit 1; }
done
[[ "$OWNER" != "$APP" && "$OWNER" != "$EDITOR" && "$OWNER" != "$PUBLISHER" && "$APP" != "$EDITOR" && "$APP" != "$PUBLISHER" && "$EDITOR" != "$PUBLISHER" ]] || { echo 'Roles must be different' >&2; exit 1; }
for value in "$ISNOTREAL_OWNER_PASSWORD" "$ISNOTREAL_APP_PASSWORD" "$ISNOTREAL_EDITOR_PASSWORD" "$ISNOTREAL_PUBLISHER_PASSWORD"; do
  [[ ${#value} -ge 24 ]] || { echo 'Generate passwords of at least 24 characters' >&2; exit 1; }
done
# Secrets enter psql through environment, not command arguments or SQL string concatenation.
node ops/libpq-run.mjs PG_ADMIN_URL psql -X -v ON_ERROR_STOP=1 -v db="$DB" -v owner="$OWNER" -v app="$APP" -v editor="$EDITOR" -v publisher="$PUBLISHER" <<'SQL'
\getenv owner_password ISNOTREAL_OWNER_PASSWORD
\getenv app_password ISNOTREAL_APP_PASSWORD
\getenv editor_password ISNOTREAL_EDITOR_PASSWORD
\getenv publisher_password ISNOTREAL_PUBLISHER_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'owner', :'owner_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'owner') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app', :'app_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'app') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'editor', :'editor_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'editor') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'publisher', :'publisher_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'publisher') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner') WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=:'db') \gexec
SQL
echo 'Database and roles exist. Existing passwords were not rotated. Migrate as owner, then apply grants.'
