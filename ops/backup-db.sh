#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
OUT="${BACKUP_DIR:-./backups}"; mkdir -p "$OUT"; F="$OUT/isnotreal-$(date -u +%Y%m%dT%H%M%SZ).dump"; pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file="$F"; echo "$F"
