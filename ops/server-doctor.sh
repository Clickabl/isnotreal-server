#!/usr/bin/env bash
set -euo pipefail
failed=0
for tool in git node npm psql pg_dump pg_restore; do
 if command -v "$tool" >/dev/null; then printf 'OK   %s\n' "$tool"; else printf 'FAIL %s missing\n' "$tool"; failed=1; fi
done
if command -v node >/dev/null; then
 major="$(node -p 'process.versions.node.split(".")[0]')"
 if [[ "$major" != 24 ]]; then echo 'FAIL Node 24 is required';failed=1;fi
fi
if [[ -n "${DATABASE_URL:-}" ]]; then
 node ops/libpq-run.mjs DATABASE_URL psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database(),current_user,version();' || failed=1
else echo 'WARN DATABASE_URL is not set';fi
[[ -d db/migrations ]] || { echo 'FAIL run from repository root';failed=1; }
exit "$failed"
