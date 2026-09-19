# isnotreal-server

Backend, public data model, publication compiler and public routing foundations for **https://isnotreal.click**.
Companion extension repository: https://github.com/Clickabl/isnotreal.

## Current status

Implemented foundations now include:

- PostgreSQL schema and first migration in `db/migrations/0001_core.sql`.
- Canonical entities with stable public IDs, aliases, unlimited external identifiers and assignment history.
- Assertions, reusable source documents/captures, campaigns, versioned reason definitions, policy revisions and reviewed list decisions.
- Explicit per-reason evidence qualification, exclusion and re-verification rules with immutable public catalog snapshots.
- Reviewed official-list imports for named campaigns and authoritative institutional lists; raw rows never publish from name matching alone.
- Membership proposals that separate verified facts from the human decision to place an entity on a filter/highlight list.
- Community submissions/corrections, moderation queues, alternatives and publication metadata.
- A compiler projection that strips server data to `[identifier, publicEntityId, reasonCodes]` tuples.
- Typed persistence adapters over a small `SqlExecutor` boundary.
- Transport-neutral API routing for search, entity profiles, alternatives, submissions and list delivery.
- Public route resolution for `/{publicId} -> /{slug}` and `/go-to-alt/{publicId}`.

The repository now includes a bounded authoritative-source capture worker, a Node HTTP runtime, filesystem publication storage, and an optional bearer-authenticated moderation API. There is still no production database/object storage provisioned, cryptographic signing/TUF implementation, graphical admin UI, public page renderer, or deployment configuration.

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
  api/                  public API router, Node runtime and authenticated moderation routes
  web/                  canonical entity and alternative redirect resolver
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

The public list pipeline intentionally separates factual ingestion from editorial membership:

```text
official/primary source
  -> immutable source capture
  -> reviewed entity resolution
  -> published factual assertion + reason code
  -> pending membership proposal
  -> human approval/rejection
  -> evidence validation gate
  -> immutable compact publication
```

A source import cannot directly place an entity on a filter or highlight list. Current-status reasons also expire from compact publications when their catalog-defined re-verification window is exceeded; the historical evidence remains in PostgreSQL.

See `docs/reason-catalog.md` for the public vocabulary and qualification rules.

## Moderation API

Set `ADMIN_BEARER_TOKEN` to enable `/admin/api/v1/*` routes. If it is unset, the admin surface returns 404. Admin responses are always `no-store`; use `ADMIN_ACTOR_ID` to identify the reviewer in audit records.

The moderation surface covers community submissions, official-import identity review, membership proposals and publication-validation failures. It is an API foundation, not a graphical admin UI.
