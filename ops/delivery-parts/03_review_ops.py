from pathlib import Path

def write(path,text):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text.lstrip('\n'))

write('packages/persistence/src/membership-review.ts',r'''
import type { SqlExecutor } from './index.js';
export interface MembershipProposal {
 readonly id:string;readonly entityPublicId:string;readonly entityName:string;readonly entitySlug:string;
 readonly assertionId:string;readonly reasonCode:string;readonly reasonLabel:string;readonly cause:string;
 readonly proposedList:'filter'|'highlight';readonly state:'pending'|'approved'|'rejected'|'withdrawn'|'applied';
 readonly assertionSummary:string;readonly createdBy:string;readonly createdAt:string;
 readonly reviewedBy:string|null;readonly reviewedAt:string|null;readonly reviewNote:string;
}
export async function proposeMembershipFromAssertion(db:SqlExecutor,assertionId:string,reasonCode:string,createdBy:string,cause?:string):Promise<string>{
 if(!createdBy.trim())throw new Error('editor identity required');
 const bindings=await db.query<{id:string}>(`SELECT c.id::text FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id WHERE rc.reason_code=$1 AND c.active AND ($2::text IS NULL OR c.slug=$2)`,[reasonCode,cause??null]);
 if(bindings.rows.length!==1)throw new Error('select one explicit cause for this reason');
 const result=await db.query<{id:string}>(`INSERT INTO membership_proposals (entity_id,assertion_id,reason_code,cause_id,proposed_list,created_by)
  SELECT a.primary_entity_id,a.id,r.code,$4,r.default_list,$3 FROM assertions a JOIN assertion_reasons ar ON ar.assertion_id=a.id AND ar.reason_code=$2
  JOIN current_reason_catalog r ON r.code=ar.reason_code AND r.publication_enabled AND r.default_list IN ('filter','highlight')
  WHERE a.id=$1 AND a.state='published' AND a.primary_entity_id IS NOT NULL
  ON CONFLICT (entity_id,assertion_id,reason_code,cause_id,proposed_list) DO UPDATE SET created_by=membership_proposals.created_by RETURNING id::text`,[assertionId,reasonCode,createdBy,bindings.rows[0]!.id]);
 const id=result.rows[0]?.id;if(!id)throw new Error('assertion is not eligible');return id;
}
export async function listMembershipProposals(db:SqlExecutor,state:MembershipProposal['state']|null='pending',limit=100):Promise<readonly MembershipProposal[]>{
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('invalid limit');
 const result=await db.query<MembershipProposal>(`SELECT p.id::text,e.public_id::text AS "entityPublicId",e.canonical_name AS "entityName",e.slug AS "entitySlug",
  p.assertion_id::text AS "assertionId",p.reason_code AS "reasonCode",r.label AS "reasonLabel",c.slug AS cause,p.proposed_list AS "proposedList",p.state,
  a.summary AS "assertionSummary",p.created_by AS "createdBy",p.created_at::text AS "createdAt",p.reviewed_by AS "reviewedBy",p.reviewed_at::text AS "reviewedAt",p.review_note AS "reviewNote"
  FROM membership_proposals p JOIN entities e ON e.id=p.entity_id JOIN assertions a ON a.id=p.assertion_id JOIN causes c ON c.id=p.cause_id
  JOIN reason_definitions r ON r.code=p.reason_code WHERE ($1::text IS NULL OR p.state=$1) ORDER BY p.created_at,p.id LIMIT $2`,[state,limit]);
 return result.rows;
}
interface ProposalRow {id:string;entity_id:string;assertion_id:string;reason_code:string;cause_id:string;proposed_list:'filter'|'highlight';state:string}
export async function approveMembershipProposal(db:SqlExecutor,id:string,reviewer:string,note=''):Promise<string>{
 if(!reviewer.trim())throw new Error('editor identity required');
 return db.transaction(async tx=>{
  const found=await tx.query<ProposalRow>('SELECT * FROM membership_proposals WHERE id=$1 FOR UPDATE',[id]);const p=found.rows[0];
  if(!p||!['pending','approved'].includes(p.state))throw new Error('proposal is not reviewable');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${p.entity_id}:${p.cause_id}:${p.proposed_list}`]);
  const binding=await tx.query<{id:string}>(`SELECT c.id::text FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id AND c.active WHERE rc.reason_code=$1 AND rc.cause_id=$2`,[p.reason_code,p.cause_id]);
  if(!binding.rows.length)throw new Error('reason/cause mismatch');
  const policy=await tx.query<{id:string}>(`SELECT r.id::text FROM policy_revisions r JOIN policies p ON p.id=r.policy_id WHERE p.slug='default-publication-policy' AND r.state='active' LIMIT 1`);
  if(!policy.rows[0])throw new Error('no publication policy');
  const old=await tx.query<{id:string;decision:string}>(`SELECT id::text,decision FROM membership_decisions WHERE entity_id=$1 AND cause_id=$2 AND list_kind=$3 AND state='active' FOR UPDATE`,[p.entity_id,p.cause_id,p.proposed_list]);
  const previous=old.rows[0];
  if(previous)await tx.query("UPDATE membership_decisions SET state='superseded' WHERE id=$1",[previous.id]);
  const next=await tx.query<{id:string}>(`INSERT INTO membership_decisions(entity_id,cause_id,list_kind,decision,state,policy_revision_id,decided_at,supersedes_decision_id)
   VALUES ($1,$2,$3,'include','active',$4,now(),$5) RETURNING id::text`,[p.entity_id,p.cause_id,p.proposed_list,policy.rows[0].id,previous?.id??null]);
  const decisionId=next.rows[0]!.id;
  if(previous?.decision==='include')await tx.query(`INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id,last_verified_at,verification_review_event_id)
   SELECT $1,reason_code,assertion_id,last_verified_at,verification_review_event_id FROM membership_decision_reasons WHERE decision_id=$2`,[decisionId,previous.id]);
  const event=await tx.query<{id:string}>(`INSERT INTO review_events(subject_type,subject_id,action,reviewer_id,rationale) VALUES('membership-proposal',$1,'approved',$2,$3) RETURNING id::text`,[id,reviewer,note]);
  const eventId=event.rows[0]!.id;
  await tx.query(`INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id,last_verified_at,verification_review_event_id) VALUES($1,$2,$3,now(),$4)
   ON CONFLICT(decision_id,reason_code,assertion_id) DO UPDATE SET last_verified_at=EXCLUDED.last_verified_at,verification_review_event_id=EXCLUDED.verification_review_event_id`,[decisionId,p.reason_code,p.assertion_id,eventId]);
  // The exact same gate protects editor approval and publication. No duplicate SQL policy.
  const gate=await tx.query<{valid_for_publication:boolean;issues:string[]}>(`SELECT valid_for_publication,issues FROM membership_reason_validation WHERE decision_id=$1 AND assertion_id=$2 AND reason_code=$3`,[decisionId,p.assertion_id,p.reason_code]);
  if(gate.rows[0]?.valid_for_publication!==true)throw new Error(`evidence gate rejected approval: ${(gate.rows[0]?.issues??['missing-catalog-rule']).join(',')}`);
  await tx.query(`UPDATE membership_proposals SET state='applied',reviewed_by=$2,reviewed_at=now(),review_note=$3,applied_decision_id=$4,applied_at=now(),verification_review_event_id=$5 WHERE id=$1`,[id,reviewer,note,decisionId,eventId]);
  return decisionId;
 });
}
export async function rejectMembershipProposal(db:SqlExecutor,id:string,reviewer:string,note:string):Promise<void>{
 if(!reviewer.trim()||!note.trim())throw new Error('reviewer and rationale required');
 await db.transaction(async tx=>{
  const result=await tx.query<{id:string}>(`UPDATE membership_proposals SET state='rejected',reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$1 AND state IN('pending','approved') RETURNING id::text`,[id,reviewer,note]);
  if(!result.rows[0])throw new Error('proposal is not reviewable');
  await tx.query(`INSERT INTO review_events(subject_type,subject_id,action,reviewer_id,rationale) VALUES('membership-proposal',$1,'rejected',$2,$3)`,[id,reviewer,note]);
 });
}
export async function createMembershipProposalsForImportBatch(db:SqlExecutor,batchId:string,actor:string):Promise<number>{
 const rows=await db.query<{assertion_id:string;reason_code:string}>(`SELECT r.assertion_id::text,b.reason_code FROM official_import_rows r JOIN official_import_batches b ON b.id=r.batch_id WHERE b.id=$1 AND r.resolution_state='committed' ORDER BY r.ordinal`,[batchId]);
 for(const row of rows.rows)await proposeMembershipFromAssertion(db,row.assertion_id,row.reason_code,actor);
 return rows.rows.length;
}
''')
p=Path('packages/persistence/src/campaign-import.ts');s=p.read_text().replace('ON CONFLICT (entity_id, assertion_id, reason_code, proposed_list)', 'ON CONFLICT (entity_id, assertion_id, reason_code, cause_id, proposed_list)');p.write_text(s)
write('ops/db-bootstrap.sh',r'''
#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_URL:?Set PG_ADMIN_URL}"
: "${ISNOTREAL_OWNER_PASSWORD:?Set ISNOTREAL_OWNER_PASSWORD}"
: "${ISNOTREAL_APP_PASSWORD:?Set ISNOTREAL_APP_PASSWORD}"
: "${ISNOTREAL_EDITOR_PASSWORD:?Set ISNOTREAL_EDITOR_PASSWORD}"
DB="${ISNOTREAL_DB_NAME:-isnotreal}"
OWNER="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"
APP="${ISNOTREAL_APP_ROLE:-isnotreal_app}"
EDITOR="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
for name in "$DB" "$OWNER" "$APP" "$EDITOR"; do
  [[ "$name" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo 'Invalid database/role identifier' >&2; exit 1; }
done
[[ "$OWNER" != "$APP" && "$OWNER" != "$EDITOR" && "$APP" != "$EDITOR" ]] || { echo 'Roles must be different' >&2; exit 1; }
for value in "$ISNOTREAL_OWNER_PASSWORD" "$ISNOTREAL_APP_PASSWORD" "$ISNOTREAL_EDITOR_PASSWORD"; do
  [[ ${#value} -ge 24 ]] || { echo 'Generate passwords of at least 24 characters' >&2; exit 1; }
done
# Secrets enter psql through environment, not command arguments or SQL string concatenation.
PGDATABASE="$PG_ADMIN_URL" psql -X -v ON_ERROR_STOP=1 -v db="$DB" -v owner="$OWNER" -v app="$APP" -v editor="$EDITOR" <<'SQL'
\getenv owner_password ISNOTREAL_OWNER_PASSWORD
\getenv app_password ISNOTREAL_APP_PASSWORD
\getenv editor_password ISNOTREAL_EDITOR_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'owner', :'owner_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'owner') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app', :'app_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'app') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'editor', :'editor_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'editor') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner') WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=:'db') \gexec
SQL
echo 'Database and roles exist. Existing passwords were not rotated. Migrate as owner, then apply grants.'
''')
write('ops/db-grants.sh',r'''
#!/usr/bin/env bash
set -euo pipefail
: "${PG_ADMIN_DB_URL:?Set an admin connection to the application database}"
OWNER="${ISNOTREAL_OWNER_ROLE:-isnotreal_owner}"
APP="${ISNOTREAL_APP_ROLE:-isnotreal_app}"
EDITOR="${ISNOTREAL_EDITOR_ROLE:-isnotreal_editor}"
for name in "$OWNER" "$APP" "$EDITOR"; do
  [[ "$name" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo 'Invalid role identifier' >&2; exit 1; }
done
PGDATABASE="$PG_ADMIN_DB_URL" psql -X -v ON_ERROR_STOP=1 -v owner="$OWNER" -v app="$APP" -v editor="$EDITOR" <<'SQL'
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
''')
write('ops/server-doctor.sh',r'''
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
 PGDATABASE="$DATABASE_URL" psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database(),current_user,version();' || failed=1
else echo 'WARN DATABASE_URL is not set';fi
[[ -d db/migrations ]] || { echo 'FAIL run from repository root';failed=1; }
exit "$failed"
''')
write('ops/db-shell.sh',r'''
#!/usr/bin/env bash
set -euo pipefail
: "${EDITOR_DATABASE_URL:?Set EDITOR_DATABASE_URL}"
export PGDATABASE="$EDITOR_DATABASE_URL"
exec psql -X -v ON_ERROR_STOP=1 "$@"
''')
write('ops/backup-db.sh',r'''
#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
umask 077
OUT="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT"
temporary="$(mktemp "$OUT/.backup-XXXXXXXX.dump.part")"
trap 'rm -f "$temporary"' EXIT
PGDATABASE="$DATABASE_URL" pg_dump --format=custom --no-owner --no-acl --file="$temporary"
pg_restore --list "$temporary" >/dev/null
final="$OUT/isnotreal-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
mv "$temporary" "$final"
printf '%s\n' "$final"
''')
write('ops/restore-db.sh',r'''
#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate empty database}"
[[ $# == 1 && -f "$1" ]] || { echo 'Usage: bash ops/restore-db.sh backup.dump' >&2;exit 1; }
# No --clean: refuse conflicting existing objects instead of destroying an existing database.
PGDATABASE="$RESTORE_DATABASE_URL" pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$1"
''')
write('ops/htaccess.example',r'''
# Requires Apache mod_rewrite, mod_proxy, mod_proxy_http, AllowOverride FileInfo
# and permission to proxy to the loopback-only Node listener. Not for static-only hosting.
RewriteEngine On
RewriteRule ^\.well-known/acme-challenge/ - [L]
RewriteCond %{HTTPS} !=on [OR]
RewriteCond %{HTTP_HOST} !^isnotreal\.click$ [NC]
RewriteRule ^ https://isnotreal.click%{REQUEST_URI} [R=301,L,NE]
# Do not exempt the document-root directory: that would skip the homepage route.
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
RewriteRule ^ http://127.0.0.1:3000%{REQUEST_URI} [P,L]
''')
for path in ['docs/SERVER_HANDOFF.md','ops/production.env.example','.env.example']:
 p=Path(path);s=p.read_text();s=s.replace('PostgreSQL 17 must be 17.11+ or PostgreSQL 18 must be 18.6+.','Use a supported PostgreSQL release with current security patches; verify the vendor release notes during provisioning.')
 import re
 s=re.sub(r'/health\b','/healthz',s);s=re.sub(r'/ready\b','/readyz',s)
 if path.endswith('.env.example') and 'ADMIN_DATABASE_URL' not in s:
  s+='\n# Optional moderation: a SEPARATE editor-role connection. Keep admin disabled unless configured.\n# ADMIN_DATABASE_URL=\n# CAUSE_SLUG=israel-palestine\n# PUBLICATION_SIGNING_KEY_FILE=/etc/isnotreal/publication-ed25519.pem\n# PUBLICATION_SIGNING_KEY_ID=release-1\n# CHROME_WEB_STORE_URL=\n# FIREFOX_ADDON_URL=\n# SAFARI_APP_STORE_URL=\n'
 p.write_text(s)
