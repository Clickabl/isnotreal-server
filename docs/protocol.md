# Extension publication protocol

Protocol schema version: **2**.

Normal extension synchronization is privacy-preserving and contains no entity names, biographies, evidence text or source URLs.

A compiled entry is the tuple:

```text
[identifier, publicEntityId, reasonCodes]
```

Example only:

```json
["712345678901", "43212", ["P03"]]
```

The identifier is always an opaque string. Public entity IDs are also serialized as strings even though the database uses `bigint`, avoiding JavaScript integer assumptions and keeping URL construction simple.

Supported publication channels currently are `x`, `tiktok`, `instagram`, `youtube` and `domain`. Each channel has independent `filter` and `highlight` lists.

`GET /api/v1/reasons` serves the small active reason-code dictionary separately from the identifier lists. It contains display labels/descriptions, never per-entity evidence.

The extension can construct `https://isnotreal.click/{publicEntityId}` for an explicit Why/details action. The website resolves that stable ID to the current canonical slug. The extension does not need a reverse platform-ID lookup endpoint.

Alternatives are intentionally online/dynamic. `/go-to-alt/{publicEntityId}` returns a temporary redirect to the current approved preferred alternative. Alternative lookup is opt-in behavior and is not part of passive feed matching.

Full snapshots and deltas are immutable publication artifacts. In a delta, `added` entries are **upserts**: an identifier appears there when it is new or when its public entity/reason codes changed. `removed` contains identifiers that should be deleted locally.

The database schema records hashes, sizes and future signing metadata; production activation/signing is not implemented yet.
