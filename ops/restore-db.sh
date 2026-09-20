#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate empty database}"
[[ $# == 1 && -f "$1" ]] || { echo 'Usage: bash ops/restore-db.sh backup.dump' >&2;exit 1; }
# No --clean: refuse conflicting existing objects instead of destroying an existing database.
node ops/libpq-run.mjs RESTORE_DATABASE_URL pg_restore --single-transaction --exit-on-error --no-owner --no-acl "$1"
