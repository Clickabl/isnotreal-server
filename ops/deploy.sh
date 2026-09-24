#!/usr/bin/env bash
# Deploy isnotreal-server on the cPanel host (see docs/SERVER_HANDOFF.md, "cPanel").
#
#   bash ~/isnotreal/current/ops/deploy.sh [git-ref]      # default: main
#
# Builds the ref in a new release directory beside the live one, backs up the
# database, migrates, applies grants, switches ~/isnotreal/current, restarts the
# Node app and checks health. If the new release is unhealthy it switches back to
# the previous release. Migrations are forward-only: a code rollback does not undo
# them, which is why a backup is taken first. Only the live and previous releases
# are kept, so repeated deploys cannot fill the disk quota.
set -euo pipefail
shopt -s nullglob
umask 077

HOME_DIR="${ISNOTREAL_HOME:-$HOME/isnotreal}"
CONFIG="$HOME_DIR/config"
# Non-secret settings (role names, health URL, node path). Credentials stay in JSON.
if [[ -f "$CONFIG/deploy.env" ]]; then
  # shellcheck source=/dev/null
  . "$CONFIG/deploy.env"
fi
REPO_URL="${ISNOTREAL_REPO_URL:-https://github.com/Clickabl/isnotreal-server.git}"
REF="${1:-${ISNOTREAL_DEPLOY_REF:-main}}"
APP_ROOT="${ISNOTREAL_APP_ROOT:-$HOME_DIR/app}"
HEALTH_URL="${ISNOTREAL_HEALTH_URL:-https://isnotreal.click/readyz}"
HEALTH_TRIES="${ISNOTREAL_HEALTH_TRIES:-20}"
HEALTH_DELAY="${ISNOTREAL_HEALTH_DELAY:-3}"
KEEP_BACKUPS="${ISNOTREAL_KEEP_BACKUPS:-7}"
if [[ -n "${ISNOTREAL_NODE_BIN_DIR:-}" ]]; then PATH="$ISNOTREAL_NODE_BIN_DIR:$PATH"; fi
export ISNOTREAL_OWNER_ROLE ISNOTREAL_APP_ROLE ISNOTREAL_EDITOR_ROLE ISNOTREAL_PUBLISHER_ROLE

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

cd "$HOME_DIR"
mkdir -p releases backups logs data/publications

# One deploy at a time. mkdir is atomic; a lock left by a dead process is reclaimed.
if ! mkdir deploy.lock 2>/dev/null; then
  holder="$(cat deploy.lock/pid 2>/dev/null || true)"
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    log "another deploy (pid $holder) is running"
    exit 75
  fi
  rm -rf deploy.lock
  mkdir deploy.lock
fi
echo $$ >deploy.lock/pid
new_release=''
activated=0
finish() {
  status=$?
  if [[ $status -ne 0 && -n "$new_release" && $activated -eq 0 ]]; then
    rm -rf "$new_release"
  fi
  rm -rf "$HOME_DIR/deploy.lock"
  exit "$status"
}
trap finish EXIT

# Replace a symlink atomically (rename over it), portable across Linux and macOS.
point() {
  node -e 'const fs = require("fs"); const [target, link] = process.argv.slice(1);
    fs.rmSync(link + ".next", { force: true }); fs.symlinkSync(target, link + ".next");
    fs.renameSync(link + ".next", link);' "$1" "$2"
}

healthy() {
  local i
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    # Only a 200 counts: a redirect (e.g. a host-level HTTP->HTTPS rule) proves nothing.
    code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' ${ISNOTREAL_HEALTH_RESOLVE:+--resolve "$ISNOTREAL_HEALTH_RESOLVE"} "$HEALTH_URL" || true)"
    if [[ "$code" == 200 ]]; then return 0; fi
    sleep "$HEALTH_DELAY"
  done
  return 1
}

restart() {
  mkdir -p "$APP_ROOT/tmp"
  cp "$HOME_DIR/current/ops/cpanel/entrypoint.mjs" "$HOME_DIR/current/ops/cpanel/config.mjs" "$APP_ROOT/"
  touch "$APP_ROOT/tmp/restart.txt"
  # LiteSpeed keeps a detached lsnode process that ignores restart.txt; stop it and the
  # next request starts the new release.
  pkill -u "$(id -u)" -f "^lsnode:$APP_ROOT/" || true
}

# 1. Fetch and resolve the ref.
if [[ ! -d repo.git ]]; then git clone --quiet --bare "$REPO_URL" repo.git; fi
git --git-dir=repo.git fetch --quiet --prune origin '+refs/heads/*:refs/heads/*'
sha="$(git --git-dir=repo.git rev-parse --verify "$REF^{commit}")"
previous="$(readlink current 2>/dev/null || true)"
if [[ -n "$previous" && "$(cat "$previous/REVISION" 2>/dev/null || true)" == "$sha" && -z "${ISNOTREAL_FORCE:-}" ]]; then
  log "already running $sha"
  exit 0
fi
log "deploying $REF ($sha)"

# 2. Build outside the live tree. A failed build never touches the running app.
new_release="releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
mkdir -p "$new_release"
git --git-dir=repo.git archive "$sha" | tar -x -C "$new_release"
echo "$sha" >"$new_release/REVISION"
(
  cd "$new_release"
  # Passenger/LiteSpeed shells may export NODE_ENV=production, which would skip the
  # TypeScript compiler that the build needs.
  env -u NODE_ENV npm ci --no-audit --no-fund --loglevel=error
  env -u NODE_ENV npm run build --silent
  env -u NODE_ENV npm prune --omit=dev --no-audit --no-fund --loglevel=error
)

# 3. Back up, migrate and re-apply grants with the owner connection.
if [[ -f "$CONFIG/db-owner.json" ]]; then
  backup="$(cd "$new_release" && BACKUP_DIR="$HOME_DIR/backups" node ops/run-with-config.mjs "$CONFIG/db-owner.json" -- bash ops/backup-db.sh)"
  log "backup $backup"
  (cd "$new_release" && node ops/run-with-config.mjs "$CONFIG/db-owner.json" -- node apps/api/dist/migrate.js)
  (cd "$new_release" && node ops/run-with-config.mjs "$CONFIG/db-owner.json" -- bash -c 'PG_ADMIN_DB_URL="$DATABASE_URL" exec bash ops/db-grants.sh')
else
  log "no $CONFIG/db-owner.json; skipping backup and migrations"
fi

# 4. Switch, restart, verify; roll back to the previous release if unhealthy.
point "$new_release" current
activated=1
restart
if healthy; then
  log "healthy: $HEALTH_URL"
else
  log "unhealthy after deploy: $HEALTH_URL"
  if [[ -n "$previous" && -d "$previous" ]]; then
    point "$previous" current
    restart
    if healthy; then log "rolled back to $previous"; else log "previous release $previous is also unhealthy"; fi
  else
    rm -f current
  fi
  rm -rf "$new_release"
  exit 1
fi

# 5. Keep only the live and previous releases, and the newest backups.
for dir in releases/*/; do
  dir="${dir%/}"
  if [[ "$dir" != "$new_release" && "$dir" != "$previous" ]]; then rm -rf "$dir"; fi
done
backups=(backups/*.dump)
if ((${#backups[@]} > KEEP_BACKUPS)); then
  # Names embed a UTC timestamp, so lexical order is chronological.
  for old in "${backups[@]:0:${#backups[@]}-KEEP_BACKUPS}"; do rm -f "$old"; done
fi
log "deployed $sha"
