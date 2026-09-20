#!/usr/bin/env bash
set -euo pipefail
if [[ ! -x /usr/lib/postgresql/17/bin/pg_dump ]]; then
  source /etc/os-release
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$VERSION_CODENAME" \
    | sudo tee /etc/apt/sources.list.d/isnotreal-pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y postgresql-client-17
fi
printf '%s\n' /usr/lib/postgresql/17/bin >> "${GITHUB_PATH:?This script is for CI only}"
