# Persistence boundary

Implemented PostgreSQL adapters/services cover public entities/search, reasons/causes, alternatives, community moderation, verified identifiers, official-list imports/rollback, source capture/watch, membership review and signed publication artifacts.

Key invariants:

- application runtime, editor and schema-owner roles are separate;
- source capture pins connections to validated public DNS results and stores immutable hashes;
- public submissions never publish directly;
- trusted official lists use one audited batch while ambiguous identities remain exceptions;
- reason facts, entity identifiers and cause membership remain separate records;
- signed publication activation is partition-scoped and rollback-safe;
- public projections exclude internal reviewer/private operational data.
