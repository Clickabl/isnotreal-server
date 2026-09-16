# Database

`migrations/0001_core.sql` is the initial PostgreSQL schema. It deliberately uses SQL as the authoritative migration format instead of coupling the model to an ORM.

Important invariants:

- `entities.public_id` is stable, public and never recycled; internal UUIDs stay server-side.
- Identifiers are separate from assignments so domains/accounts can change ownership without erasing history.
- An assertion is a sourced factual record; a reason is a display classification; a membership decision is editorial policy. They are not interchangeable.
- Company/brand relationships never automatically copy factual assertions to another entity.
- Community submissions are quarantined from published data until reviewed.
- `publication_candidates` is the only extension-facing compiler projection. It emits no names or evidence.
- Submitted URLs are stored only. Fetching/capturing them must happen in an isolated worker with SSRF controls.

Production should use separate migration, application-read/write and publication/signing roles. Publication signing authority must not live in the ordinary API process.
