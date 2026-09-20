#!/usr/bin/env bash
set -euo pipefail
: "${EDITOR_DATABASE_URL:?Set EDITOR_DATABASE_URL}"
exec node ops/libpq-run.mjs EDITOR_DATABASE_URL psql -X -v ON_ERROR_STOP=1 "$@"
