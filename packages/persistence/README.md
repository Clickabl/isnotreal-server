# Persistence boundary

Reserved for database adapters implementing application ports. No database client, ORM, schema migrations, seed data, or connection behavior exists yet. Domain models are conceptual records, not a ready-to-run relational schema.

Before implementation decide database/host, transaction boundaries, revision semantics, retention and backup policies. Enforce platform+stable-ID uniqueness, evidence/source foreign keys, and append-only moderation history. Separate immutable published blocklist snapshots from mutable editorial work; publishing/removing IDs must atomically advance versions and deltas. Keep private dispute/contact and reviewer details out of public projections.
