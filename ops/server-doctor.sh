#!/usr/bin/env bash
set -euo pipefail
fail=0
ok(){ printf "OK   %s\\n" "$1"; }
bad(){ printf "FAIL %s\\n" "$1"; fail=1; }
warn(){ printf "WARN %s\\n" "$1"; }
command -v git >/dev/null && ok "$(git --version)" || bad "git missing"
command -v node >/dev/null && ok "node $(node --version)" || bad "node missing; Node 24 required"
command -v npm >/dev/null && ok "npm $(npm --version)" || bad "npm missing"
command -v psql >/dev/null && ok "$(psql --version)" || bad "psql missing"
if command -v node >/dev/null; then major="$(node -p "process.versions.node.split(\047.\047)[0]")"; [[ "$major" == 24 ]] && ok "Node major 24" || bad "Node 24 required"; fi
if [[ -n "${DATABASE_URL:-}" ]]; then psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "select current_database(),current_user,version();" && ok "DATABASE_URL connects" || bad "DATABASE_URL failed"; else warn "DATABASE_URL not set"; fi
[[ -d db/migrations ]] && ok "migrations present" || bad "migrations missing"
exit "$fail"
