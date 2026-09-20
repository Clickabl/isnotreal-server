#!/usr/bin/env bash
set -euo pipefail
: "${EDITOR_DATABASE_URL:?Set EDITOR_DATABASE_URL}"
exec psql "$EDITOR_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
