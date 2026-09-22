# isnotreal-server

Backend, public website, moderation/import tooling and signed publication service for **https://isnotreal.click**.
Companion extension repository: https://github.com/Clickabl/isnotreal.

## Current status

Implemented and continuously tested components include:

- PostgreSQL entities, aliases, stable public IDs, verified identifiers and assignment history.
- Cause-scoped factual reason catalog with qualification/exclusion criteria and publication availability.
- Immutable source capture with public-IP validation, DNS-pinned fetching, hashes and reusable captures.
- Trusted official-list staging, identity review, one-batch commit and audited rollback.
- Public feedback/corrections/abuse queue with moderation states and duplicate clustering.
- Verified identifier enrichment requiring a published sourced assertion.
- Alternatives with public browsing and local extension eligibility checks.
- Signed cause/channel/list publications with full/delta artifacts, dictionaries, expiry and activation history.
- Public API plus responsive website for search, entities/evidence, causes/reasons, alternatives, downloads, privacy and feedback.
- Bearer-authenticated editor console for submissions, identifiers, imports, proposals and publication issues.
- Least-privilege runtime/editor/owner DB roles, Nginx rate limits/timeouts, application backpressure, backup/restore smoke gates and production runbooks.
- Idempotent CCFP source capture/stage/prepare command for the first requested official-list import.

Production infrastructure, store listings and populated live data require the actual server/cloud/browser-store credentials; they are deployment actions rather than hidden code scaffolds.

## Local development

Use Node 24 (`nvm use`) and npm 11.9.0.

```sh
npm ci
npm run check
```

`check` runs formatting, lint, typecheck, build and tests.

## Architecture

```text
apps/
  api/                  public API, runtime, admin routes and import/publisher CLIs
  web/                  responsive public website and editor console
packages/
  config/               production defaults
  protocol/             minimized extension publication contract
  domain/               canonical facts/editorial types
  application/          ports, public projections and compiler
  persistence/          SQL-backed repositories, evidence/import/review services and publishers
db/
  migrations/           authoritative PostgreSQL schema
  README.md              migration/runtime notes
docs/
  architecture.md
  data-model.md
  protocol.md
tests/
```

PostgreSQL is the source of truth. The extension never receives names, biographies, evidence or source URLs in normal list synchronization. Compiled publications contain only the stable platform/domain identifier, stable public entity ID and short display reason codes. The website/API can resolve the public entity ID into the complete public record.

## Reason and evidence workflow

Trusted official lists use one reviewed batch rather than redundant per-person editorial approvals:

```text
official/primary source
  -> immutable source capture
  -> reviewed/automatic unambiguous identity resolution
  -> sourced factual assertions
  -> cause/list membership in one trusted batch
  -> validation gate
  -> signed compact publication
```

Ambiguous identities remain exceptions; they do not hold the rest of a trusted batch hostage. Community submissions never publish directly. Historical evidence remains in PostgreSQL when a membership is rolled back or a current-status reason expires.

See `docs/reason-catalog.md` and `docs/PRODUCT_DELIVERY_PLAN.md`.

## Moderation API

Set `ADMIN_BEARER_TOKEN` to enable `/admin/api/v1/*` routes. If it is unset, the admin surface returns 404. Admin responses are always `no-store`; use `ADMIN_ACTOR_ID` to identify the reviewer in audit records.

The moderation surface covers community submissions/abuse reports, verified identifier enrichment, official-import identity review/commit/rollback, membership proposals and publication-validation failures. `/admin-console` is the graphical editor UI and keeps the bearer token in browser session storage only.

## Production/server handoff

Before a server-access session, read `docs/SERVER_HANDOFF.md`. The `ops/` directory contains a host/database doctor, restricted PostgreSQL role bootstrap/grants, editor shell, backup helper, production env example, and systemd/nginx templates. Actual people/evidence/list data should be written to PostgreSQL rather than committed as Git migrations; schema changes remain migration-controlled.
