#!/usr/bin/env bash
set -euo pipefail

ADMIN_ROOT='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
DB='isnotreal_ops_test'
RESTORE='isnotreal_ops_restore'
OWNER='isnotreal_owner_ops'
APP='isnotreal_app_ops'
EDITOR='isnotreal_editor_ops'
PUBLISHER='isnotreal_publisher_ops'
PW_OWNER='ops-owner-test-password-12345'
PW_APP='ops-app-test-password-1234567'
PW_EDITOR='ops-editor-test-password-1234'
PW_PUBLISHER='ops-publisher-test-password-1234'

cleanup() {
  psql "$ADMIN_ROOT" -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$DB','$RESTORE') AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $RESTORE;
DROP DATABASE IF EXISTS $DB;
DROP ROLE IF EXISTS $APP;
DROP ROLE IF EXISTS $EDITOR;
DROP ROLE IF EXISTS $PUBLISHER;
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
export ISNOTREAL_PUBLISHER_ROLE="$PUBLISHER"
export ISNOTREAL_OWNER_PASSWORD="$PW_OWNER"
export ISNOTREAL_APP_PASSWORD="$PW_APP"
export ISNOTREAL_EDITOR_PASSWORD="$PW_EDITOR"
export ISNOTREAL_PUBLISHER_PASSWORD="$PW_PUBLISHER"
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
retention_id="$(psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -Atqc "INSERT INTO community_submissions(submission_type,narrative,state,reviewed_at) VALUES('product-feedback','sensitive spam body','spam',now()-interval '100 days') RETURNING id")"
psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -c "INSERT INTO submission_sources(submission_id,url) VALUES('$retention_id','https://example.com/spam')" >/dev/null
DATABASE_URL="postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -f ops/retention.sql >/dev/null
test "$(psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -Atqc "SELECT narrative FROM community_submissions WHERE id='$retention_id'")" = '[redacted after abuse-retention window]'
test "$(psql "postgresql://$EDITOR:$PW_EDITOR@127.0.0.1:5432/$DB" -Atqc "SELECT count(*) FROM submission_sources WHERE submission_id='$retention_id'")" = '0'
psql "postgresql://$PUBLISHER:$PW_PUBLISHER@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM publication_candidates" >/dev/null
if psql "postgresql://$PUBLISHER:$PW_PUBLISHER@127.0.0.1:5432/$DB" -v ON_ERROR_STOP=1 -c "DELETE FROM causes" >/dev/null 2>&1; then
  echo "publisher role unexpectedly has broad DELETE privileges" >&2
  exit 1
fi

export BACKUP_DIR=.ci-backups
backup="$(bash ops/backup-db.sh)"
test -s "$backup"

psql "$ADMIN_ROOT" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $RESTORE OWNER $OWNER" >/dev/null
RESTORE_DATABASE_URL="postgresql://$OWNER:$PW_OWNER@127.0.0.1:5432/$RESTORE" bash ops/restore-db.sh "$backup"
count="$(psql "postgresql://$OWNER:$PW_OWNER@127.0.0.1:5432/$RESTORE" -Atqc "SELECT count(*) FROM schema_migrations")"
test "$count" -gt 0

echo "bootstrap, least-privilege grants, backup and restore smoke test passed"
