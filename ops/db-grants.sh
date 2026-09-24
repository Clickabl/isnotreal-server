#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_DB_URL:?Set PG_ADMIN_DB_URL to an administrative connection to the isnotreal database}"

OWNER_ROLE="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"
APP_ROLE="${ISNOTREAL_APP_ROLE:-isnotreal_app}"
EDITOR_ROLE="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
PUBLISHER_ROLE="${ISNOTREAL_PUBLISHER_ROLE:-isnotreal_publisher}"

# On a VPS this runs as a superuser. On cPanel it runs as the migration owner, which
# owns every table but neither the public schema nor CREATEROLE, so those two steps
# are applied only where this connection is allowed to.
node ops/libpq-run.mjs PG_ADMIN_DB_URL psql -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF pg_has_role((SELECT nspowner FROM pg_namespace WHERE nspname = 'public'), 'MEMBER') THEN
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  ELSE
    RAISE NOTICE 'public schema belongs to another role; its CREATE privilege is unchanged';
  END IF;
END
\$\$;
GRANT USAGE ON SCHEMA public TO $APP_ROLE, $EDITOR_ROLE, $PUBLISHER_ROLE;

-- Reset broad privileges before applying the intended least-privilege model.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM $APP_ROLE, $EDITOR_ROLE, $PUBLISHER_ROLE;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM $APP_ROLE, $EDITOR_ROLE, $PUBLISHER_ROLE;

-- Runtime API: public reads plus the narrow community-submission write path.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $APP_ROLE;
GRANT INSERT ON community_submissions, submission_sources TO $APP_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $APP_ROLE;

-- Trusted editor/import sessions may mutate application data, but cannot alter schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $EDITOR_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $EDITOR_ROLE;

-- Publisher: read canonical state and write only publication metadata/artifacts.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $PUBLISHER_ROLE;
GRANT INSERT, UPDATE ON publications TO $PUBLISHER_ROLE;
GRANT INSERT ON publication_artifacts, publication_policy_revisions TO $PUBLISHER_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $PUBLISHER_ROLE;

-- Future owner-created objects default to read-only for the runtime and DML for editors.
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER_ROLE IN SCHEMA public
  GRANT SELECT ON TABLES TO $APP_ROLE, $PUBLISHER_ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER_ROLE IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $EDITOR_ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER_ROLE IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO $APP_ROLE, $EDITOR_ROLE, $PUBLISHER_ROLE;

DO \$\$
BEGIN
  IF (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    ALTER ROLE $APP_ROLE SET statement_timeout = '30s';
    ALTER ROLE $EDITOR_ROLE SET statement_timeout = '5min';
    ALTER ROLE $PUBLISHER_ROLE SET statement_timeout = '5min';
    ALTER ROLE $APP_ROLE SET idle_in_transaction_session_timeout = '30s';
    ALTER ROLE $EDITOR_ROLE SET idle_in_transaction_session_timeout = '2min';
    ALTER ROLE $PUBLISHER_ROLE SET idle_in_transaction_session_timeout = '2min';
  ELSE
    RAISE NOTICE 'no CREATEROLE: per-role timeouts not set';
  END IF;
END
\$\$;
SQL

echo "Least-privilege runtime/editor grants applied. Runtime writes are limited to community submissions; publisher writes are limited to publication metadata."
