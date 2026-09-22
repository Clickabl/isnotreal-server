# Database

PostgreSQL migrations are the authoritative schema and are exercised from a clean PostgreSQL 17 service in CI. They cover entities/identifiers, evidence/source captures, cause-scoped reasons and membership, alternatives, community feedback/moderation, official-list imports, source-change review and signed publication metadata.

Important invariants:

- `entities.public_id` is stable and never recycled; internal UUIDs stay server-side.
- Identifiers are separate from assignments so ownership can change without erasing history.
- Assertions are sourced facts; reasons classify facts; membership decisions control publication. They are not interchangeable.
- Each reason code has one owning cause. Users can choose local filter/highlight treatment independently.
- Company/brand relationships never automatically copy factual assertions.
- Community submissions are quarantined until review; trusted official imports are audited and reversible.
- `publication_candidates` is the only compact extension-facing projection and emits no names/evidence.
- Source fetching uses application SSRF/DNS controls and should also have production egress restrictions.
- Production uses separate owner, runtime and editor roles; signing authority stays outside the public API process.
