# isnotreal-server

Backend, public data model, publication compiler and public routing foundations for **https://isnotreal.click**.
Companion extension repository: https://github.com/Clickabl/isnotreal.

## Current status

Implemented foundations now include:

- PostgreSQL schema and first migration in `db/migrations/0001_core.sql`.
- Canonical entities with stable public IDs, aliases, unlimited external identifiers and assignment history.
- Assertions, reusable source documents/captures, campaigns, reason definitions, policy revisions and reviewed list decisions.
- Community submissions/corrections, alternatives and publication metadata.
- A compiler projection that strips server data to `[identifier, publicEntityId, reasonCodes]` tuples.
- Typed persistence adapters over a small `SqlExecutor` boundary.
- Transport-neutral API routing for search, entity profiles, alternatives, submissions and list delivery.
- Public route resolution for `/{publicId} -> /{slug}` and `/go-to-alt/{publicId}`.

There is still no production database provisioned, HTTP server/framework binding, source-fetching worker, object-storage publisher, signing/TUF implementation, admin UI, public page renderer or deployment configuration.

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
  api/                  transport-neutral API router
  web/                  canonical entity and alternative redirect resolver
packages/
  config/               production defaults
  protocol/             minimized extension publication contract
  domain/               canonical facts/editorial types
  application/          ports, public projections and compiler
  persistence/          SQL-backed repository adapters over SqlExecutor
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
