# isnotreal-server

Scaffolding for the backend/API and public site at **https://isnotreal.click**.
Companion repository: https://github.com/Clickabl/isnotreal.

**Status:** architecture, TypeScript contracts and development tooling only. No running API/site, production database, datasets, evidence collection, hosting or DNS changes.

## Local development

Use Node 24 (`nvm use`) and npm 11.9.0.

```sh
npm ci
npm run check
```

`check` runs formatting, lint, typecheck, scaffold tests and TypeScript build. `build` emits workspace JS/declarations into each dist directory; it does not start or deploy an application. `typecheck` uses TypeScript project references and may emit declaration files into ignored dist directories. `npm run format` applies formatting. No environment values are needed for these commands. `.env.example` documents production defaults; runtime env loading is intentionally absent.

## Structure

```text
apps/
  api/                  HTTP composition boundary
  web/                  Public site and Why page boundary
packages/
  config/               Production defaults
  protocol/             Authoritative IDs-only public wire contracts
  domain/               Entities, accounts, reasons, sources, reviews, disputes
  application/          Application ports
  persistence/          Future infrastructure adapters
docs/                  Architecture and protocol semantics
tests/                 Scaffold tests; integration foundations
.github/workflows/     CI
```

Server evidence data stays here. The extension gets only stable platform account IDs plus minimal synchronization metadata. Multiple platform accounts can belong to one canonical entity. Reasons must describe sourced actions, statements or affiliations; an editorial inclusion decision is separate from the factual evidence record.

Read [architecture](docs/architecture.md), [protocol](docs/protocol.md) and [test boundaries](tests/README.md) before implementation. All packages are private pending a deliberate publishing/license decision. CI performs validation only and has read-only repository permissions. Work directly on main without overwriting another work chat's changes.
