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
