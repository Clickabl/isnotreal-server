#!/usr/bin/env bash
set -euo pipefail

ADMIN_ROOT='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
DB='isnotreal_ops_test'
RESTORE='isnotreal_ops_restore'
OWNER='isnotreal_owner_ops'
APP='isnotreal_app_ops'
EDITOR='isnotreal_editor_ops'
PW_OWNER='ops-owner-test-password'
PW_APP='ops-app-test-password'
PW_EDITOR='ops-editor-test-password'

cleanup() {
  psql "$ADMIN_ROOT" -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$DB','$RESTORE') AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $RESTORE;
DROP DATABASE IF EXISTS $DB;
DROP ROLE IF EXISTS $APP;
DROP ROLE IF EXISTS $EDITOR;
DROP ROLE IF EXISTS $OWNER;
SQL
  rm -rf .ci-backups
}
trap cleanup EXIT
cleanup
trap cleanup EXIT

export PG_ADMIN_URL="$ADMIN_ROOT"
export ISNOTREAL_DB_NAME="$DB"
export ISNOTREAL_OWNER_ROLE="$OWNER"
export ISNOTREAL_APP_ROLE="$APP"
export ISNOTREAL_EDITOR_ROLE="$EDITOR"
export ISNOTREAL_OWNER_PASSWORD="$PW_OWNER"
export ISNOTREAL_APP_PASSWORD="$PW_APP"
export ISNOTREAL_EDITOR_PASSWORD="$PW_EDITOR"
bash ops/db-bootstrap.sh

export DATABASE_URL="postgresql://$OWNER:$PW_OWNER@127.0.0.1:5432/$DB"
npm run db:migrate

export PG_ADMIN_DB_URL="postgresql://postgres:postgres@127.0.0.1:5432/$DB"
bash ops/db-grants.sh

psql "postgresql://$APP:$PW_APP@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM causes" >/dev/null
if psql "postgresql://$APP:$PW_APP@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -c "DELETE FROM causes" >/dev/null 2>&1; then
  echo "runtime role unexpectedly has broad DELETE privileges" >&2
  exit 1
fi
psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM causes" >/dev/null

export BACKUP_DIR=.ci-backups
backup="$(bash ops/backup-db.sh)"
test -s "$backup"

psql "$ADMIN_ROOT" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $RESTORE OWNER $OWNER" >/dev/null
pg_restore --no-owner --no-acl --dbname="postgresql://$OWNER:$PW_OWNER@127.0.0.1:5432/$RESTORE" "$backup"
count="$(psql "postgresql://$OWNER:$PW_OWNER@127.0.0.1:5432/$RESTORE" -Atqc "SELECT count(*) FROM schema_migrations")"
test "$count" -gt 0

echo "bootstrap, least-privilege grants, backup and restore smoke test passed"
