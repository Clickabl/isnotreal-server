#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
umask 077
OUT="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT"
temporary="$(mktemp "$OUT/.backup-XXXXXXXX.dump.part")"
trap 'rm -f "$temporary"' EXIT
node ops/libpq-run.mjs DATABASE_URL pg_dump --format=custom --no-owner --no-acl --file="$temporary"
pg_restore --list "$temporary" >/dev/null
final="$OUT/isnotreal-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
mv "$temporary" "$final"
printf '%s\n' "$final"
