# Server architecture

Two application entry points share packages inside this npm workspace: apps/api and apps/web. Both consume application use-case contracts; packages/domain holds editorial records; packages/persistence will implement application ports. Domain never imports HTTP, database or browser code. Config is side-effect free. No runtime framework is selected in this pass.

Canonical entity -> many platform accounts; each account is identified by (platform, stable ID). An identity source establishes ownership. Handle changes do not create new identities. Evidence supports a specific reason about the entity; sources hold provenance and dates. InclusionDecision records the separate reviewed, versioned policy decision to add/remove an account. One factual reason does not automatically add every related account. The eligibility policy remains to be defined.

Reason revisions and append-only ReviewEvent history preserve who reviewed what and when. DisputeRecord tracks challenges; CorrectionRecord links revisions and review outcomes. Types are architectural only: future validators and persistence constraints enforce nonempty sources, referential integrity, immutable revisions and allowed state transitions. Do not store unsupported broad political conclusions as verified facts. Distinguish documented affiliation from inferred endorsement and facts from editorial policy.

Publishing produces a minimized projection of approved account IDs. Immutable full snapshots and deltas should be independently cacheable so distribution scales separately from editorial writes. A failed publication never exposes half a version. Removals/corrections propagate through deltas. Exact wire semantics are in protocol.md; no storage mechanism or job runner exists yet.

Public Why rendering is isolated from passive blocklist delivery. It must explicitly project public fields; do not serialize domain records or moderation/contact metadata directly. Private reviewer identity is for internal audit, with public history redacted. No browsing telemetry, event reporting or account lookup endpoint is required for passive extension filtering.

## Work ownership

- Protocol: packages/protocol and docs/protocol.md; coordinate changes with extension snapshot.
- Evidence/moderation: packages/domain; persistence belongs in its own later task.
- API/publication: apps/api and packages/application.
- Public Why UI: apps/web.
- Persistence: packages/persistence after infrastructure choices.

## Decisions before the relevant implementation

1. Hosting/runtime, HTTP/web frameworks and database; no provider has been provisioned.
2. Inclusion criteria, authorized reviewers, review thresholds, dispute handling and correction/removal deadlines.
3. Approved sources/identity verification rules and field-level public/private policy.
4. Initial stable-ID access strategy with extension adapter owners.
5. Publication scale: snapshot size, delta retention, integrity/rollback checks and update cadence.
6. Contract distribution beyond the initial snapshot: versioned package or generated schema artifact. Server remains authoritative either way.
