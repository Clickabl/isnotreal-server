# Public protocol v1 (design contract; no routes implemented)

Production origin: https://isnotreal.click. The server owns packages/protocol. The extension carries a pinned source snapshot so each repository builds independently without a third repository, package registry, or authenticated dependency download. Update the server contract first, then explicitly sync and review the extension snapshot. Incompatible changes require a new schema/API version; never silently change v1 semantics.

| Planned route                                        | Purpose                                     | User gesture required         |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| GET /api/v1/blocklists/:platform/manifest            | Current opaque platform version             | No                            |
| GET /api/v1/blocklists/:platform/full                | IDs-only snapshot plus version envelope     | No                            |
| GET /api/v1/blocklists/:platform/delta?from=:version | Added/removed IDs plus base/target versions | No                            |
| GET /why/:platform/:accountId                        | Public explanation page                     | Yes, when opened by extension |

The platform route keys are x, tiktok, instagram, youtube. IDs are opaque strings, scoped by platform. Names and handles must never substitute for stable IDs. Version envelopes are synchronization control data; no canonical entity IDs, names, reasons, evidence, source URLs or per-account annotations are included in any blocklist response.

Full snapshots identify exactly one immutable version. Delta added and removed sets are disjoint and duplicate-free. Apply only to the exact fromVersion, validate the complete response, then atomically replace IDs and version. Never update the cursor before committing the corresponding IDs. Gaps, expired delta retention, or incompatible local state require a full snapshot (planned HTTP 409 FULL_SYNC_REQUIRED for unavailable bases). Network failures retain the last valid snapshot. Unknown schemas must not be applied. Removals are first-class so corrections propagate. Versions are per-platform and never inferred from timestamps.

Implement runtime validation and explicit field projection later: TypeScript interfaces alone do not prevent extra JSON fields or establish trust. Do not serialize domain objects directly. Design byte limits, pagination/chunking, integrity checks, delta retention, cache headers and rollback protection before large-scale distribution.

Passive requests depend only on configured platform and stored version, never feed encounters. Do not record or upload content IDs, viewed accounts, page URLs or interaction logs. Why navigation is an explicit click, carries only platform and account ID, uses no referrer, and has no hover/prefetch/analytics path. The public site must also disable framework link prefetch and avoid leaking that identifier to third-party resources. No Why DTO is shipped to the extension in this scaffold; explicit Why opens the public page.
