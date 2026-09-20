# Server handoff

Read AGENTS.md and docs/PRODUCT_DELIVERY_PLAN.md before this handoff. The scope now includes an actual public website, installable extension, independently selectable causes and separate software/data update pipelines. Provisioning a database or importing a petition does not finish the product.

## Deployment gate

The ops files are templates, not validated production automation. Before using them on the real database, complete O01/O02 in the product plan: execute shell/SQL tests against disposable PostgreSQL, correct quoting/escaping, and replace the current blanket app-table write grants with least-privilege runtime/editor/publisher permissions. Do not expose the public API with unrestricted table modification permissions.

No production server, deployed database or browser-store availability was verified in the September 20 scope audit.

## Goal

Provision the real PostgreSQL database and API runtime for isnotreal.click, then import the first official signatory list directly into PostgreSQL. Actual people/evidence data belongs in PostgreSQL. Schema, migrations and application code stay in Git.

## Security rules

- Never commit or paste database passwords, bearer tokens, private keys or production env files into chat/Git.
- Intended roles: isnotreal_owner for migrations, a least-privilege public runtime role, and a separate trusted editor/publisher credential. Test actual privileges rather than assuming role names enforce separation.
- Never use postgres/superuser for routine application or data work.
- Require authenticated, certificate-validated TLS for remote PostgreSQL and private-network/firewall restrictions. Same-host PostgreSQL should not be publicly exposed.
- Verify the currently supported, security-patched PostgreSQL release against official release/security documentation at deployment. Do not rely on the earlier unverified hard-coded minor-version floor. Changing the tested major version requires migration/integration verification.
- Back up before destructive bulk edits and verify restoration against a disposable database.
- Integration tests must use a disposable test database, never the production connection string.

## First terminal pass

    cd /srv/isnotreal-server   # adapt to actual checkout
    git status
    git pull --ff-only
    npm ci
    npm run check

Inspect before changing the machine:

    uname -a
    cat /etc/os-release
    node --version || true
    npm --version || true
    psql --version || true
    systemctl status postgresql --no-pager || true
    systemctl status nginx --no-pager || true
    ss -lntp
    df -h
    free -h

Review and execution-test ops/server-doctor.sh, ops/db-bootstrap.sh, ops/db-grants.sh, ops/db-shell.sh and ops/backup-db.sh before using them on the host. Run the live integration test with RUN_DB_INTEGRATION=1 only after setting a disposable test DATABASE_URL.

## Database setup after the deployment gate

Create credentials privately on the server or in the secret manager. Do not put them in Git, chat, shell tracing or command output. Validate role/database identifiers and credential handling in the bootstrap scripts before running them.

Run migrations using the owner connection. Apply reviewed least-privilege grants afterward. Run the migration command again and verify already-applied migrations are unchanged. Never rewrite an applied migration to work around a checksum mismatch.

The earlier bootstrap/grant examples remain represented by the ops templates, but their presence in Git is not approval to execute them unchanged against production.

## Direct editing

Use the restricted editor connection for trusted data operations. Confirm its effective privileges first. Keep the public service, editor and signing/publishing capabilities separated.

After validating the helper:

    bash ops/db-shell.sh

The helper expects EDITOR_DATABASE_URL to be set privately. For ordinary trusted data scripts, DATABASE_URL may refer to that restricted editor connection. Migrations use the owner connection, not the public API credential.

## Runtime

Copy ops/production.env.example to a protected secret file such as /etc/isnotreal/isnotreal.env and replace every placeholder. Verify permissions on that file and on publication storage. Never expose the admin bearer token to extension/public JavaScript. The current bearer-authenticated API is not a complete production identity/access system.

Build:

    npm ci
    npm run build

Start the reviewed systemd service or use npm start in a separate terminal. After startup, the actual health endpoints are:

    curl -fsS http://127.0.0.1:3000/healthz
    curl -fsS http://127.0.0.1:3000/readyz

The old /health and /ready examples did not match apps/api/src/runtime.ts. A successful health endpoint does not verify the homepage, redirects, evidence pages or browser extension.

## First requested data import

Source: Creative Community for Peace October 12, 2023 open letter. Reason: I02, under the Israel/Palestine cause once cause-scoped decisions are available.

For this trusted official-list import, do not require redundant per-person approval plus membership approval. The desired batch behavior is:

1. Fetch/parse the complete official signatory list and verify the source version.
2. Store/reuse the shared source document/capture.
3. Reuse exact unambiguous entities; create missing people where identity is established.
4. Quarantine genuinely ambiguous names without blocking unrelated verified rows.
5. Create the sourced I02 assertions/reasons transactionally and idempotently.
6. Apply the selected cause-scoped publication policy in the same trusted batch, with one batch audit record. Do not enable this cause on users' devices without their selection.
7. Attribute the signature to the individual; do not infer that their listed employer signed or expand the signature into unrelated positions.
8. Enrich stable social identifiers later. No verified platform ID means no match on that platform, not an invented ID.
9. Report source rows, new/reused entities, ambiguous rows, assertions, duplicates skipped and cause-scoped memberships applied.
10. Back up first, verify counts/constraints afterward and retain a tested correction/undo path.

Do not import unrelated sensitive personal records as an extension dataset. The additional cause definitions and source/privacy boundaries are in the product plan.

## Next-session instruction

Read AGENTS.md, docs/PRODUCT_DELIVERY_PLAN.md and this handoff. Inspect the host and current commits first. Validate and fix the deployment helpers and privileges on disposable PostgreSQL before production. Align the extension/server contracts and the cause-scoped data model rather than continuing the outdated single-global-list design. Provision the real database and API using protected credentials, with verified backups and health checks. Implement one trusted-batch CCFP import as I02 without redundant approval stages, preserving exact source context and identity exceptions. Keep schema/code in Git and factual data in PostgreSQL. Then demonstrate the product's install/settings/block/evidence/alternative/update integration milestone. Report what is implemented, tested, deployed and publicly available separately; do not call the whole product done from a backend CI pass.
