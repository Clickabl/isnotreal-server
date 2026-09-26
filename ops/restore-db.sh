#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate empty database}"
[[ $# == 1 && -f "$1" ]] || { echo 'Usage: bash ops/restore-db.sh backup.dump' >&2;exit 1; }
# No --clean: refuse conflicting existing objects instead of destroying an existing database.
# plpgsql is built into every database, and PostgreSQL 10's pg_dump still emits it plus
# its comment, which only a superuser may replace. Skip those two entries so the
# non-superuser owner used on cPanel can restore.
list="$(mktemp)"
trap 'rm -f "$list"' EXIT
pg_restore --list "$1" | grep -vE ' (EXTENSION - plpgsql|COMMENT - EXTENSION plpgsql) ' >"$list"
node ops/libpq-run.mjs RESTORE_DATABASE_URL pg_restore --single-transaction --exit-on-error --no-owner --no-acl --use-list="$list" "$1"
