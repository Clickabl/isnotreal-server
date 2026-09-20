# Server handoff

Use this as the starting point for the next ChatGPT/terminal session with server access.

## Goal

Provision the real PostgreSQL database and API runtime for isnotreal.click, then import the first official signatory list directly into PostgreSQL. Actual people/evidence data belongs in PostgreSQL. Schema, migrations and application code stay in Git.

## Security rules

- Never commit or paste DB passwords, bearer tokens, private keys, or production env files into chat/Git.
- Use isnotreal_owner only for migrations, isnotreal_app for the API, and isnotreal_editor for trusted data editing/imports.
- Never use postgres/superuser for routine app or data work.
- Remote PostgreSQL must require TLS and should be firewall/private-network restricted. If DB and API share a host, prefer loopback/private networking.
- PostgreSQL 17 must be 17.11+ or PostgreSQL 18 must be 18.6+.
- Back up before destructive bulk edits.

## First terminal pass

    cd /srv/isnotreal-server   # adapt to actual checkout
    git status
    git pull --ff-only
    npm ci
    npm run check
    bash ops/server-doctor.sh

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

## Bootstrap DB

Generate three different random passwords on the server. Keep them out of Git/chat.

    export PG_ADMIN_URL="postgresql://..."
    export ISNOTREAL_OWNER_PASSWORD="..."
    export ISNOTREAL_APP_PASSWORD="..."
    export ISNOTREAL_EDITOR_PASSWORD="..."
    bash ops/db-bootstrap.sh

Run migrations with an owner connection:

    export DATABASE_URL="postgresql://isnotreal_owner:...@HOST:5432/isnotreal?sslmode=require"
    npm run db:migrate

Then grant runtime/editor permissions:

    export PG_ADMIN_DB_URL="postgresql://ADMIN.../isnotreal?sslmode=require"
    bash ops/db-grants.sh
    npm run db:migrate

## Direct editing

    export EDITOR_DATABASE_URL="postgresql://isnotreal_editor:...@HOST:5432/isnotreal?sslmode=require"
    bash ops/db-shell.sh

The editor role can edit application data but cannot own/alter the schema or become superuser. For trusted data scripts, temporarily set DATABASE_URL to EDITOR_DATABASE_URL. Migrations always use the owner role.

## Runtime

Copy ops/production.env.example to a secret file such as /etc/isnotreal/isnotreal.env. Fill the app-role DATABASE_URL. Generate ADMIN_BEARER_TOKEN with openssl rand -hex 32. Never expose that token to extension/public JS.

Build and health-check:

    npm ci
    npm run build
    npm start
    curl -fsS http://127.0.0.1:3000/health
    curl -fsS http://127.0.0.1:3000/ready

## First requested data import

Source: Creative Community for Peace October 12, 2023 open letter. Reason: I02.

For this trusted official-list import, do not require redundant per-person approval plus membership approval. The desired batch behavior is:

1. Fetch/parse the complete official signatory list.
2. Store/reuse the single source document/capture.
3. Reuse exact unambiguous entities; create missing people.
4. Quarantine only genuinely ambiguous names. Do not hold the rest of the batch hostage.
5. Create the I02 sourced assertion/reason for every accepted signer in one transaction.
6. Apply the reason catalog default list direction in the same trusted batch, with one batch audit record.
7. Never infer a listed employer/company signed. CCFP signers are individuals.
8. Social IDs can be enriched later. A person without a stable platform ID stays in the full website DB but cannot match that platform in the extension yet.
9. Report source rows, new entities, reused entities, ambiguous rows, assertions created, duplicate rows skipped and membership rows applied.
10. Back up before import and verify counts/constraints afterward.

Before import:

    export DATABASE_URL="$EDITOR_DATABASE_URL"
    bash ops/backup-db.sh

## Exact next-session prompt

You have terminal/server access now. Read AGENTS.md and docs/SERVER_HANDOFF.md first. Inspect the host instead of assuming its setup. Get the real PostgreSQL database and API runtime healthy using the restricted owner/app/editor roles described there. Do not put secrets in Git or chat. Once the database is verified, simplify the trusted official-list import so one trusted batch approval applies the sourced reason and list membership without redundant per-person approval stages. Then import the complete official CCFP October 12, 2023 signatory list as reason I02 directly into PostgreSQL. Reuse exact unambiguous existing entities, create missing entities, quarantine only genuinely ambiguous names, and do not infer company positions from individual signers. Back up first, run the import transactionally, verify counts and constraints afterward, and rebuild compact publications where stable platform identifiers exist. Keep schema/code changes in Git; put actual people/evidence data in PostgreSQL.
