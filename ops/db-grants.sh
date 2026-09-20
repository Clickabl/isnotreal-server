#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_DB_URL:?Set PG_ADMIN_DB_URL to admin connection for isnotreal DB}"
OWNER="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"; APP="${ISNOTREAL_APP_ROLE:-isnotreal_app}"; EDITOR="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
psql "$PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 <<SQL
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO $APP,$EDITOR;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO $APP,$EDITOR;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO $APP,$EDITOR;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO $APP,$EDITOR;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO $APP,$EDITOR;
ALTER ROLE $APP SET statement_timeout=\04730s\047;
ALTER ROLE $EDITOR SET statement_timeout=\0475min\047;
ALTER ROLE $APP SET idle_in_transaction_session_timeout=\04730s\047;
ALTER ROLE $EDITOR SET idle_in_transaction_session_timeout=\0472min\047;
SQL
echo "Runtime/editor grants applied; neither role has schema-owner or superuser privileges."
