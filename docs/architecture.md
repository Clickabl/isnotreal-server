# Architecture

The product has two repositories: this PostgreSQL-backed public website/API and the companion browser extension. The server is not the extension, and a build is not a deployed service.

## Canonical data and publication

PostgreSQL holds entities, stable public IDs, verified platform/domain identifiers, evidence, sources/captures, reason catalogs, causes, membership decisions, alternatives and reports. Reasons describe specific documented actions, never inferred identity or ideology. A reason has one owning cause; an entity may match multiple independent causes.

The publisher uses a consistent database snapshot and the evidence-validation projection to compile reusable cause/channel/list partitions. Protocol v5 envelopes carry the cause, dataset and reason-catalog versions, expiry and signed artifact descriptors. Individual entries remain `[identifier, publicEntityId, reasonCodes]`. Full snapshots, deltas and dictionaries are immutable. The isolated publisher uses an Ed25519 private key; browser packages contain only trusted public keys.

`/api/v1/causes/{cause}/lists/{channel}/{filter|highlight}/{manifest|full|delta}` is the synchronization route. `/data/publications/...` serves versioned bytes with immutable caching. Publication and extension software updates are separate systems. Schema migrations are operator-controlled and forward-only.

## Public UI

`apps/web` renders homepage, download availability, search, cause/reason explanations, entity/evidence pages, alternatives, help, privacy and the shared feedback form. `apps/api/src/runtime.ts` mounts the renderer and JSON APIs in the same HTTP service. Numeric entity URLs and `/go-to-alt/{id}` resolve through PostgreSQL, not a per-entity Apache rewrite file. Nginx/Apache templates forward those routes to the application.

Public HTML uses shared styles and packaged, same-origin scripts. Text and source links are validated/escaped. Public reports and the editor shell are not cached. Downloads are enabled only for configured official store links; unpublished releases are not fabricated.

## Feedback and review

`packages/application/src/feedback.ts` is the single category catalog consumed by validation and UI. Evidence corrections route to the evidence inbox, product/bug/accessibility issues to product, and abuse/privacy reports to safety. A public submission cannot publish evidence or change a filter.

The writer validates entity references, deduplicates source URLs and provides UUID-based idempotency. Retrying the same request returns its receipt; reusing the UUID for different content conflicts. The inbox uses bounded pagination, duplicate candidates, revision-checked review updates and audit events. Spam/rejected reports remain distinguishable from accepted evidence.

`/editor` is a locked, non-sensitive shell. Its access token stays in memory, expires on inactivity and is cleared on lock/page exit. The authenticated API uses a separate editor database connection. Server-side authorization is the boundary; hiding UI is not authorization. Deploy the admin API behind a private network/access gateway as well.

## Request safety

The Node runtime enforces body, URI, method, type, origin, timeout and concurrency limits. Bounded per-client buckets key clients through an in-memory HMAC; untrusted forwarding headers are ignored. Only explicitly configured immediate proxies may supply the client address. Metrics use coarse fixed route families, not visited URLs, entity IDs or filter preferences.

The checked-in Nginx limits are a backstop, not a complete distributed-denial-of-service perimeter. Production requires managed edge protection, origin isolation and measured limits. The database runtime role is read-mostly with only the submission write path; schema ownership and editing are separate.

## Verification

`npm run check` runs formatting, lint, TypeScript/build and tests. CI sets `RUN_DB_INTEGRATION=1` for real migrations, publication/evidence/feedback transactions and restricted-role checks. `npm run test:browser` exercises the public form and locked editor, safe text rendering, error/retry behavior and responsive keyboard-accessible layouts. Browser checks are a required CI job.

`docs/PRODUCT_DELIVERY_PLAN.md` is the single delivery ledger. It distinguishes implemented/tested code from unprovisioned infrastructure, unpopulated datasets and unpublished browser-store releases.
