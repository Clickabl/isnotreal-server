# Server architecture

PostgreSQL is the canonical source of truth. API/application reads are separated from immutable extension publication delivery so editorial activity never becomes a per-scroll server dependency.

## Boundaries

- `packages/domain`: facts, identity, evidence, policy and moderation concepts. No HTTP/database imports.
- `packages/application`: public projections, use-case ports and deterministic publication compiler.
- `packages/persistence`: PostgreSQL queries behind a tiny `SqlExecutor` interface. The eventual driver can be `pg`, a managed Postgres adapter or another compatible executor without changing domain/application code.
- `apps/api`: transport-neutral route handling. A later HTTP/runtime adapter should translate real requests into `ApiRequest` and serialize `ApiResponse`.
- `apps/web`: canonical entity and preferred-alternative route resolution. Framework/CDN/edge implementation is deployment detail.
- `db/migrations`: authoritative schema.

## Privacy invariant

Passive browsing never sends encountered account/domain IDs to isnotreal.click. The extension matches locally against compiled publications. A server request happens only for normal publication synchronization or an explicit online feature such as opening an entity page or requesting an alternative.

## Public routing

`/{publicEntityId}` resolves permanently to `/{canonical-slug}`. Public IDs are never recycled. Merged entities keep resolving to the surviving canonical entity.

`/go-to-alt/{publicEntityId}` is a temporary redirect because preferred alternatives can change. Alternative selection excludes currently filtered entities and should later enforce loop detection at the routing layer.

## Publication

The database projection is:

```text
verified identifier assignment
+ active include membership decision
+ published supporting assertion
+ active reason code
-> publication_candidates
-> deterministic compiler
-> immutable artifact
-> object storage/CDN
-> extension local index
```

Production publishing still needs object storage, staged activation, full/delta retention, TUF-style signing/key rotation, rollback protection and randomized client update scheduling.

## Publication storage on shared hosting

The default runtime and publisher use `PostgresArtifactStore`. Migration 0033 adds
`publication_artifact_payloads`, keyed by the existing immutable download path.
Exact signed bytes are gzip-compressed in PostgreSQL and checked against their
SHA-256 and original size on reads. Runtime credentials can read these payloads;
publisher credentials can insert them, but cannot replace existing bytes.
Canonical entities, evidence, policy and publication metadata remain in PostgreSQL.
`PUBLICATION_STORAGE=files` is an explicit legacy adapter setting.

The publisher hashes cause-scoped candidate data, dictionary labels, policy
revisions, protocol/compiler/source identity, TTL and signing public key. It reuses
a matching active version only while more than half its TTL remains and every
active full snapshot, dictionary and signed manifest verifies. Changed content,
key rotation, renewal or broken serving artifacts cause a fresh publication.
The cPanel publication cron serializes overlapping runs with `flock`.

Legacy file migration has separate import, verification and removal modes. All
files must match their metadata receipts and round-trip byte-for-byte through the
database before any removal. Import is idempotent and leaves serving files intact.
The deployment script imports before selecting the new runtime; removal is a
separate operation after public download verification and a recoverable backup.
Historical immutable download URLs continue to resolve through the database.
Database backups now include the generated payload history as well as metadata.

A manual rollback to code predating database payload storage requires restoring
the legacy file backup first, or explicitly retaining its file representation.
Automatic rollback during the initial deployment happens before file removal;
subsequent deployments roll back to the database-backed runtime.
