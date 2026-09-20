#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_DB_URL:?Set an admin connection to the application database}"
OWNER="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"
APP="${ISNOTREAL_APP_ROLE:-isnotreal_app}"
EDITOR="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
for name in "$OWNER" "$APP" "$EDITOR"; do
  [[ "$name" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo 'Invalid role identifier' >&2; exit 1; }
done
node ops/libpq-run.mjs PG_ADMIN_DB_URL psql -X -v ON_ERROR_STOP=1 -v owner="$OWNER" -v app="$APP" -v editor="$EDITOR" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app", :"editor";
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM :"app";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public REVOKE ALL ON TABLES FROM :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM :"app";
GRANT SELECT ON entities,entity_names,identifiers,identifier_kinds,identifier_assignments,identifier_aliases,
 entity_relationships,assertions,assertion_participants,assertion_reasons,assertion_source_links,source_documents,source_captures,
 reason_definitions,reason_evidence_requirements,reason_campaign_bindings,reason_authority_sources,campaigns,campaign_versions,
 reason_catalog_versions,reason_catalog_entries,current_reason_catalog,causes,reason_causes,cause_reason_preferences,public_cause_catalog,
 membership_decisions,membership_decision_reasons,entity_alternatives,alternative_destinations,publications,publication_artifacts
 TO :"app";
GRANT INSERT ON community_submissions,submission_sources TO :"app";
GRANT SELECT(id,submitted_at) ON community_submissions TO :"app";
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO :"editor";
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO :"editor";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO :"editor";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO :"editor";
ALTER ROLE :"app" SET statement_timeout='30s';
ALTER ROLE :"editor" SET statement_timeout='5min';
ALTER ROLE :"app" SET idle_in_transaction_session_timeout='30s';
ALTER ROLE :"editor" SET idle_in_transaction_session_timeout='2min';
SQL
echo 'Public runtime has read access and submission-only inserts. Admin operations require the editor connection.'
