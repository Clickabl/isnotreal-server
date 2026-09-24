#!/usr/bin/env bash
# cPanel cron entry point for the scheduled jobs that systemd timers run on a VPS.
#
#   bash ~/isnotreal/current/ops/cpanel/cron.sh publish        # every 30 minutes
#   bash ~/isnotreal/current/ops/cpanel/cron.sh source-watch   # every 12 hours
#   bash ~/isnotreal/current/ops/cpanel/cron.sh retention      # weekly
#
# Each job uses its own restricted database login from ~/isnotreal/config.
set -euo pipefail
HOME_DIR="${ISNOTREAL_HOME:-$HOME/isnotreal}"
C="$HOME_DIR/config"
if [[ -f "$C/deploy.env" ]]; then
  # shellcheck source=/dev/null
  . "$C/deploy.env"
fi
if [[ -n "${ISNOTREAL_NODE_BIN_DIR:-}" ]]; then PATH="$ISNOTREAL_NODE_BIN_DIR:$PATH"; fi
cd "$HOME_DIR/current"
mkdir -p "$HOME_DIR/logs"
log="$HOME_DIR/logs/${1:-unknown}.log"
{
  printf '%s start %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${1:-}"
  case "${1:-}" in
    publish)
      node ops/run-with-config.mjs "$C/db-pub.json,$C/publisher.json" -- node apps/api/dist/publish.js
      ;;
    source-watch)
      node ops/run-with-config.mjs "$C/db-editor.json,$C/runtime.json" -- node apps/api/dist/watch-sources.js
      ;;
    retention)
      node ops/run-with-config.mjs "$C/db-editor.json" -- node ops/libpq-run.mjs DATABASE_URL psql -X -v ON_ERROR_STOP=1 -q -f ops/retention.sql
      ;;
    *)
      echo "usage: cron.sh publish|source-watch|retention" >&2
      exit 2
      ;;
  esac
} >>"$log" 2>&1
